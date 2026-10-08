-- ============================================================
-- expense_claims_v3_project.sql
-- Per-project claim generation + rolling period window
-- + DH two-step flow (Acknowledge Receipt → Approve)
-- Run AFTER expense_claims_workflow.sql
-- ============================================================

-- ── 1. Add project_id FK + DH acknowledge columns ──────────

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS project_id              UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS dh_acknowledged_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_acknowledged_by      UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS dh_acknowledged_by_name TEXT;

-- ── 2. Unique constraint: one claim per (entity, employee, period, project) ──
-- Drop old constraint if it exists (safe — just a unique index)
DROP INDEX IF EXISTS uq_expense_claim_per_employee;
DROP INDEX IF EXISTS uq_expense_claims_emp_period;

-- Partial unique index: NULL project_id treated as distinct (PostgreSQL default)
-- For employees with no project: one claim per (entity, employee, period) when project_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_emp_period_project
  ON expense_claims (entity_id, employee_id, period, project_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_emp_period_no_project
  ON expense_claims (entity_id, employee_id, period)
  WHERE project_id IS NULL;

-- ── 3. Rewrite generate_expense_claims ─────────────────────
-- Groups by (employee_id, project_id) — one claim per employee per project
-- Uses rolling period: 26th prev month to 25th current (Jan=1–25, Dec=26 Nov–31 Dec)
-- Computes total_sheets: each sheet holds 29 expense lines (line 1 = FA summary)
-- Food allowance records are NOT linked via claim_id — fetched by date range at display time

CREATE OR REPLACE FUNCTION generate_expense_claims(
  p_entity_id    UUID,
  p_period       TEXT,            -- e.g. '2026-10'
  p_generated_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_base        DATE;
  v_yr          INTEGER;
  v_mo          INTEGER;
  v_from        DATE;
  v_to          DATE;

  v_row         RECORD;
  v_claim_id    UUID;
  v_claim_num   TEXT;
  v_total       NUMERIC(12,2);
  v_vat         NUMERIC(12,2);
  v_advance     NUMERIC(12,2);
  v_dept        TEXT;
  v_rec_count   INTEGER;
  v_late_count  INTEGER;
  v_generated   INTEGER := 0;
  v_skipped     INTEGER := 0;
  v_result      JSONB   := '[]'::JSONB;
  v_entity_code TEXT;
  v_gen_name    TEXT;
BEGIN
  -- Resolve entity code for claim numbering
  SELECT entity_code INTO v_entity_code FROM entities WHERE id = p_entity_id;
  v_entity_code := COALESCE(v_entity_code, 'EXP');

  -- Resolve generator name
  IF p_generated_by IS NOT NULL THEN
    SELECT full_name_en INTO v_gen_name FROM employees WHERE id = p_generated_by;
  END IF;

  -- ── Rolling period window ──────────────────────────────
  -- '2026-01' → 2026-01-01 to 2026-01-25
  -- '2026-MM' → (YYYY)-(MM-1)-26 to (YYYY)-(MM)-25
  -- '2026-12' → 2026-11-26 to 2026-12-31
  v_base := TO_DATE(p_period || '-01', 'YYYY-MM-DD');
  v_yr   := EXTRACT(YEAR  FROM v_base)::INTEGER;
  v_mo   := EXTRACT(MONTH FROM v_base)::INTEGER;

  IF v_mo = 1 THEN
    v_from := TO_DATE(v_yr || '-01-01', 'YYYY-MM-DD');
  ELSE
    v_from := TO_DATE(
      v_yr || '-' || LPAD((v_mo - 1)::TEXT, 2, '0') || '-26',
      'YYYY-MM-DD'
    );
  END IF;

  IF v_mo = 12 THEN
    v_to := TO_DATE(v_yr || '-12-31', 'YYYY-MM-DD');
  ELSE
    v_to := TO_DATE(
      v_yr || '-' || LPAD(v_mo::TEXT, 2, '0') || '-25',
      'YYYY-MM-DD'
    );
  END IF;

  -- ── Loop: one row per (employee, project) pair ─────────
  FOR v_row IN
    SELECT
      er.employee_id,
      sa.project_id,
      COALESCE(p.project_number, '—')                     AS project_no,
      COALESCE(p.project_name,   'No Project')            AS project_name,
      COALESCE(MAX(d.dept_code), MAX(d.dept_name), '—')   AS dept_code
    FROM   expense_records er
    JOIN   employees   emp ON emp.id = er.employee_id
    LEFT JOIN departments d   ON d.id = emp.department_id
    LEFT JOIN site_assignments sa
           ON sa.employee_id = er.employee_id
          AND sa.is_active   = true
    LEFT JOIN projects p ON p.id = sa.project_id
    WHERE  er.entity_id  = p_entity_id
      AND  er.claim_id   IS NULL
      AND  er.amount     > 0
      AND  er.expense_date BETWEEN v_from AND v_to
      AND  er.status     NOT IN ('REJECTED', 'VOID')
    GROUP BY er.employee_id, sa.project_id, p.project_number, p.project_name
  LOOP
    -- Skip if claim already exists for this employee+project+period
    IF EXISTS (
      SELECT 1 FROM expense_claims
      WHERE  entity_id   = p_entity_id
        AND  employee_id = v_row.employee_id
        AND  period      = p_period
        AND  (
          (project_id IS NOT DISTINCT FROM v_row.project_id)
        )
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Totals for this employee+project pair in the period
    SELECT
      COALESCE(SUM(er.amount),      0),
      COALESCE(SUM(er.vat_amount),  0),
      COUNT(*),
      COUNT(*) FILTER (WHERE er.late_days > 30)
    INTO v_total, v_vat, v_rec_count, v_late_count
    FROM  expense_records er
    WHERE er.entity_id   = p_entity_id
      AND er.employee_id = v_row.employee_id
      AND er.claim_id    IS NULL
      AND er.amount      > 0
      AND er.expense_date BETWEEN v_from AND v_to
      AND er.status      NOT IN ('REJECTED', 'VOID');

    -- Advances for this employee in this period
    SELECT COALESCE(SUM(mrl.amount), 0)
    INTO   v_advance
    FROM   money_request_lines mrl
    JOIN   money_requests mr ON mr.id = mrl.money_request_id
    WHERE  mr.entity_id    = p_entity_id
      AND  mr.requested_by = v_row.employee_id
      AND  mr.status       = 'APPROVED'
      AND  mr.created_at::DATE BETWEEN v_from AND v_to;

    -- Claim number: EXP-2026-10-RATAL-001
    -- If same employee has >1 project, each gets its own sequential number
    v_claim_num := 'EXP-' || p_period || '-' || v_entity_code || '-'
                || LPAD(nextval('expense_claim_seq')::TEXT, 3, '0');

    INSERT INTO expense_claims (
      entity_id, employee_id, claim_number, period,
      project_id, project_no, project_name,
      department,
      -- 29 expense lines per sheet (line 1 reserved for FA summary per sheet)
      total_sheets,
      total_claimed, total_vat_recoverable,
      total_advances_received, balance_with_employee,
      total_late_entries,
      status, generated_by, generated_by_name, generated_at, submitted_at
    ) VALUES (
      p_entity_id, v_row.employee_id, v_claim_num, p_period,
      v_row.project_id, v_row.project_no, v_row.project_name,
      v_row.dept_code,
      -- sheets: each sheet = 29 expense lines; last sheet may be smaller
      GREATEST(1, CEIL(v_rec_count::NUMERIC / 29)::INTEGER),
      v_total, v_vat,
      v_advance, (v_advance - v_total),
      v_late_count,
      'SUBMITTED', p_generated_by, v_gen_name, now(), now()
    )
    RETURNING id INTO v_claim_id;

    -- Link expense_records to this claim
    UPDATE expense_records SET
      claim_id = v_claim_id,
      status   = 'SUBMITTED'
    WHERE entity_id   = p_entity_id
      AND employee_id = v_row.employee_id
      AND claim_id    IS NULL
      AND amount      > 0
      AND expense_date BETWEEN v_from AND v_to
      AND status NOT IN ('REJECTED', 'VOID');

    v_generated := v_generated + 1;
    v_result := v_result || jsonb_build_object(
      'employee_id',  v_row.employee_id,
      'project_no',   v_row.project_no,
      'project_name', v_row.project_name,
      'claim_id',     v_claim_id,
      'claim_number', v_claim_num,
      'total',        v_total,
      'sheets',       GREATEST(1, CEIL(v_rec_count::NUMERIC / 29)::INTEGER),
      'late_entries', v_late_count
    );
  END LOOP;

  RETURN jsonb_build_object(
    'generated', v_generated,
    'skipped',   v_skipped,
    'period',    p_period,
    'from_date', v_from,
    'to_date',   v_to,
    'claims',    v_result
  );
END;
$$;

-- ── 4. Update preview_expense_claims ───────────────────────
-- Must DROP first — return type (OUT columns) changed from prior version
DROP FUNCTION IF EXISTS preview_expense_claims(UUID, TEXT);

CREATE OR REPLACE FUNCTION preview_expense_claims(
  p_entity_id UUID,
  p_period    TEXT
)
RETURNS TABLE (
  employee_id    UUID,
  full_name_en   TEXT,
  employee_no    TEXT,
  department     TEXT,
  project_id     UUID,
  project_no     TEXT,
  project_name   TEXT,
  record_count   BIGINT,
  total_amount   NUMERIC,
  total_vat      NUMERIC,
  has_claim      BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_base DATE;
  v_yr   INTEGER;
  v_mo   INTEGER;
  v_from DATE;
  v_to   DATE;
BEGIN
  v_base := TO_DATE(p_period || '-01', 'YYYY-MM-DD');
  v_yr   := EXTRACT(YEAR  FROM v_base)::INTEGER;
  v_mo   := EXTRACT(MONTH FROM v_base)::INTEGER;

  IF v_mo = 1 THEN
    v_from := TO_DATE(v_yr || '-01-01', 'YYYY-MM-DD');
  ELSE
    v_from := TO_DATE(v_yr || '-' || LPAD((v_mo-1)::TEXT,2,'0') || '-26', 'YYYY-MM-DD');
  END IF;

  IF v_mo = 12 THEN
    v_to := TO_DATE(v_yr || '-12-31', 'YYYY-MM-DD');
  ELSE
    v_to := TO_DATE(v_yr || '-' || LPAD(v_mo::TEXT,2,'0') || '-25', 'YYYY-MM-DD');
  END IF;

  RETURN QUERY
  SELECT
    er.employee_id,
    emp.full_name_en,
    emp.employee_number,
    COALESCE(d.dept_code, d.dept_name, '—')              AS department,
    sa.project_id,
    COALESCE(p.project_number, '—')                       AS project_no,
    COALESCE(p.project_name, 'No Project')                AS project_name,
    COUNT(er.id)                                          AS record_count,
    COALESCE(SUM(er.amount), 0)                           AS total_amount,
    COALESCE(SUM(er.vat_amount), 0)                       AS total_vat,
    EXISTS (
      SELECT 1 FROM expense_claims ec2
      WHERE ec2.entity_id   = p_entity_id
        AND ec2.employee_id = er.employee_id
        AND ec2.period      = p_period
        AND (ec2.project_id IS NOT DISTINCT FROM sa.project_id)
    )                                                     AS has_claim
  FROM   expense_records er
  JOIN   employees   emp ON emp.id = er.employee_id
  LEFT JOIN departments d   ON d.id = emp.department_id
  LEFT JOIN site_assignments sa
         ON sa.employee_id = er.employee_id
        AND sa.is_active   = true
  LEFT JOIN projects p ON p.id = sa.project_id
  WHERE  er.entity_id  = p_entity_id
    AND  er.claim_id   IS NULL
    AND  er.amount     > 0
    AND  er.expense_date BETWEEN v_from AND v_to
    AND  er.status     NOT IN ('REJECTED', 'VOID')
  GROUP BY er.employee_id, emp.full_name_en, emp.employee_number,
           d.dept_code, d.dept_name, sa.project_id,
           p.project_number, p.project_name
  ORDER BY emp.full_name_en, p.project_number;
END;
$$;

-- ── 5. New RPC: dh_acknowledge_claim ────────────────────────
-- Separate from dh_approve_claim — called when physical documents arrive at DH desk
-- Does NOT change claim status; sets dh_acknowledged_at only

CREATE OR REPLACE FUNCTION dh_acknowledge_claim(
  p_claim_id       UUID,
  p_dh_employee_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Claim not found');
  END IF;

  IF v_claim.status <> 'SUBMITTED' THEN
    RETURN jsonb_build_object('error', 'Can only acknowledge SUBMITTED claims');
  END IF;

  IF v_claim.dh_acknowledged_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Claim already acknowledged');
  END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;

  UPDATE expense_claims SET
    dh_acknowledged_at      = now(),
    dh_acknowledged_by      = p_dh_employee_id,
    dh_acknowledged_by_name = v_emp.full_name_en
  WHERE id = p_claim_id;

  -- Notify Finance Admin that DH has received physical documents
  BEGIN
    INSERT INTO notifications
      (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id, v_claim.generated_by,
       'CLAIM_DH_ACKNOWLEDGED',
       'Physical documents received — ' || v_claim.claim_number,
       COALESCE(v_emp.full_name_en, 'DH') || ' confirmed physical receipt of claim '
         || v_claim.claim_number || '. Documents are under review.',
       'LOW', 'expense_claim', p_claim_id);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'ok', true,
    'acknowledged_at', now(),
    'acknowledged_by', v_emp.full_name_en
  );
END;
$$;

-- ── 6. Update dh_approve_claim to require acknowledgment ───
-- DH must acknowledge receipt before approving
-- (soft requirement — warn but do not block if acknowledged_at IS NULL)

CREATE OR REPLACE FUNCTION dh_approve_claim(
  p_claim_id       UUID,
  p_dh_employee_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Claim not found');
  END IF;
  IF v_claim.status <> 'SUBMITTED' THEN
    RETURN jsonb_build_object('error', 'Claim must be in SUBMITTED status');
  END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;

  UPDATE expense_claims SET
    status              = 'DH_APPROVED',
    dh_approved_at      = now(),
    dh_approved_by      = p_dh_employee_id,
    dh_approved_by_name = COALESCE(v_emp.full_name_en, 'Unknown'),
    -- Auto-set acknowledge if DH approves without acknowledging (fallback)
    dh_acknowledged_at      = COALESCE(dh_acknowledged_at, now()),
    dh_acknowledged_by      = COALESCE(dh_acknowledged_by, p_dh_employee_id),
    dh_acknowledged_by_name = COALESCE(dh_acknowledged_by_name, v_emp.full_name_en)
  WHERE id = p_claim_id;

  BEGIN
    INSERT INTO notifications
      (entity_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id,
       'CLAIM_DH_APPROVED',
       'Claim approved by DH — ' || v_claim.claim_number,
       COALESCE(v_emp.full_name_en, 'DH') || ' approved claim ' || v_claim.claim_number
         || ' (' || v_claim.period || '). Ready for Accounts review.',
       'MEDIUM', 'expense_claim', p_claim_id);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'DH_APPROVED',
    'was_acknowledged', v_claim.dh_acknowledged_at IS NOT NULL
  );
END;
$$;

-- ── 7. Grant execute to authenticated users ─────────────────
GRANT EXECUTE ON FUNCTION generate_expense_claims(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION preview_expense_claims(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION dh_acknowledge_claim(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION dh_approve_claim(UUID, UUID) TO authenticated;
