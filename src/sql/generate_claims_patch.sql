-- ============================================================
-- generate_claims_patch.sql
-- Links expense_records → expense_claims via claim_id
-- Adds generate_expense_claims() RPC for Supervisor/DH use
-- ============================================================

-- ── 0b. Widen VARCHAR columns on expense_claims that could overflow ──
DROP VIEW IF EXISTS expense_claim_summary;
ALTER TABLE expense_claims ALTER COLUMN claim_number TYPE TEXT;
ALTER TABLE expense_claims ALTER COLUMN period       TYPE TEXT;
ALTER TABLE expense_claims ALTER COLUMN status       TYPE TEXT;
ALTER TABLE expense_claims ALTER COLUMN department   TYPE TEXT;
ALTER TABLE expense_claims ALTER COLUMN project_no   TYPE TEXT;
ALTER TABLE expense_claims ALTER COLUMN project_name TYPE TEXT;
-- Recreate view after column type change
CREATE OR REPLACE VIEW expense_claim_summary AS
  SELECT
    ec.id,
    ec.entity_id,
    ec.employee_id,
    ec.claim_number,
    ec.period,
    ec.status,
    ec.total_claimed,
    ec.total_vat_recoverable,
    ec.total_advances_received,
    ec.balance_with_employee,
    ec.submitted_at,
    ec.dh_approved_at,
    e.full_name_en AS employee_name,
    e.employee_number
  FROM expense_claims ec
  LEFT JOIN employees e ON e.id = ec.employee_id;

-- ── 1. Add claim_id to expense_records (if not exists) ─────
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES expense_claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_records_claim_id ON expense_records(claim_id);

-- ── 2. Add missing columns to expense_claims ───────────────
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS department       TEXT,
  ADD COLUMN IF NOT EXISTS project_no       TEXT,
  ADD COLUMN IF NOT EXISTS project_name     TEXT,
  ADD COLUMN IF NOT EXISTS generated_by     UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS generated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_late_entries INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sheets     INTEGER DEFAULT 1;

-- ── 3. Auto claim number sequence ──────────────────────────
CREATE SEQUENCE IF NOT EXISTS expense_claim_seq START 1;

-- ── 4. generate_expense_claims() RPC ───────────────────────
-- Called by Supervisor/DH after the 25th to bundle all RECORDED
-- expense_records for the period into one claim per employee.
-- Idempotent: skips employees who already have a claim for the period.
--
-- Returns: { generated: N, skipped: N, employees: [{...}] }

CREATE OR REPLACE FUNCTION generate_expense_claims(
  p_entity_id   UUID,
  p_period      TEXT,    -- 'YYYY-MM'
  p_generated_by UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_emp         RECORD;
  v_claim_id    UUID;
  v_claim_num   TEXT;
  v_total       NUMERIC(12,2);
  v_vat         NUMERIC(12,2);
  v_advance     NUMERIC(12,2);
  v_dept        TEXT;
  v_proj_no     TEXT;
  v_proj_name   TEXT;
  v_late_count  INTEGER;
  v_generated   INTEGER := 0;
  v_skipped     INTEGER := 0;
  v_result_emps JSONB   := '[]'::JSONB;
  v_entity_code TEXT;
BEGIN
  -- Look up short entity code for claim numbering
  SELECT entity_code INTO v_entity_code FROM entities WHERE id = p_entity_id;
  v_entity_code := COALESCE(v_entity_code, 'EXP');
  -- Loop over all employees who have unclaimed expense_records in this period
  FOR v_emp IN
    SELECT DISTINCT er.employee_id
    FROM   expense_records er
    WHERE  er.entity_id  = p_entity_id
      AND  er.claim_id   IS NULL
      AND  er.amount     > 0
      AND  TO_CHAR(er.expense_date, 'YYYY-MM') = p_period
      AND  er.status     NOT IN ('REJECTED','VOID')
  LOOP
    -- Skip if a claim already exists for this employee + period
    IF EXISTS (
      SELECT 1 FROM expense_claims
      WHERE  entity_id   = p_entity_id
        AND  employee_id = v_emp.employee_id
        AND  period      = p_period
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Aggregate totals
    SELECT
      COALESCE(SUM(er.amount), 0),
      COALESCE(SUM(er.vat_amount), 0),
      COUNT(*) FILTER (WHERE er.late_days > 30),
      COALESCE(MAX(d.dept_name), '—'),
      MAX(p.project_number),
      MAX(p.project_name)
    INTO v_total, v_vat, v_late_count, v_dept, v_proj_no, v_proj_name
    FROM  expense_records er
    JOIN  employees emp            ON emp.id = er.employee_id
    LEFT JOIN departments d        ON d.id = emp.department_id
    LEFT JOIN site_assignments sa  ON sa.employee_id = er.employee_id AND sa.is_active = true
    LEFT JOIN projects p           ON p.id = sa.project_id
    WHERE er.entity_id  = p_entity_id
      AND er.employee_id = v_emp.employee_id
      AND er.claim_id   IS NULL
      AND er.amount      > 0
      AND TO_CHAR(er.expense_date, 'YYYY-MM') = p_period
      AND er.status NOT IN ('REJECTED','VOID');

    -- Look up advance for this employee for this period
    -- money_requests uses requested_by (UUID) not employee_id
    SELECT COALESCE(SUM(mrl.amount), 0)
    INTO   v_advance
    FROM   money_request_lines mrl
    JOIN   money_requests mr ON mr.id = mrl.money_request_id
    WHERE  mr.entity_id    = p_entity_id
      AND  mr.requested_by = v_emp.employee_id
      AND  mr.status       = 'APPROVED'
      AND  TO_CHAR(mr.created_at, 'YYYY-MM') = p_period;

    -- Generate claim number: EXP-YYYY-MM-ENTITY-NNN
    v_claim_num := 'EXP-' || p_period || '-'
                || v_entity_code || '-'
                || LPAD(nextval('expense_claim_seq')::TEXT, 3, '0');

    -- Insert the claim
    INSERT INTO expense_claims (
      entity_id, employee_id, claim_number, period,
      department, project_no, project_name,
      total_claimed, total_vat_recoverable,
      total_advances_received, balance_with_employee,
      total_late_entries, total_sheets,
      status, generated_by, generated_at, submitted_at
    ) VALUES (
      p_entity_id, v_emp.employee_id, v_claim_num, p_period,
      v_dept, v_proj_no, v_proj_name,
      v_total, v_vat,
      v_advance, (v_advance - v_total),
      v_late_count, CEIL(
        (SELECT COUNT(*) FROM expense_records
         WHERE entity_id = p_entity_id AND employee_id = v_emp.employee_id
           AND claim_id IS NULL AND amount > 0
           AND TO_CHAR(expense_date,'YYYY-MM') = p_period)::NUMERIC / 30
      )::INTEGER,
      'SUBMITTED', p_generated_by, now(), now()
    )
    RETURNING id INTO v_claim_id;

    -- Link expense_records to this claim
    UPDATE expense_records SET
      claim_id = v_claim_id,
      status   = 'SUBMITTED'
    WHERE entity_id   = p_entity_id
      AND employee_id = v_emp.employee_id
      AND claim_id    IS NULL
      AND amount      > 0
      AND TO_CHAR(expense_date, 'YYYY-MM') = p_period
      AND status NOT IN ('REJECTED','VOID');

    v_generated := v_generated + 1;
    v_result_emps := v_result_emps || jsonb_build_object(
      'employee_id',  v_emp.employee_id,
      'claim_id',     v_claim_id,
      'claim_number', v_claim_num,
      'total',        v_total,
      'late_entries', v_late_count
    );
  END LOOP;

  RETURN jsonb_build_object(
    'generated', v_generated,
    'skipped',   v_skipped,
    'period',    p_period,
    'claims',    v_result_emps
  );
END;
$$;

-- ── 5. Preview: count unclaimed records per employee ───────
-- Call before generating to show the Supervisor what will be created
CREATE OR REPLACE FUNCTION preview_expense_claims(
  p_entity_id UUID,
  p_period    TEXT
)
RETURNS TABLE (
  employee_id   UUID,
  full_name_en  TEXT,
  department    TEXT,
  record_count  BIGINT,
  total_amount  NUMERIC,
  late_count    BIGINT,
  already_claimed BOOLEAN
)
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT
    e.id                                    AS employee_id,
    e.full_name_en,
    COALESCE(d.dept_name, e.department_id::TEXT, '—') AS department,
    COUNT(er.id)                            AS record_count,
    COALESCE(SUM(er.amount),0)              AS total_amount,
    COUNT(*) FILTER (WHERE er.late_days > 30) AS late_count,
    EXISTS (
      SELECT 1 FROM expense_claims ec
      WHERE ec.entity_id   = p_entity_id
        AND ec.employee_id = e.id
        AND ec.period      = p_period
    )                                       AS already_claimed
  FROM  expense_records er
  JOIN  employees e ON e.id = er.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
  WHERE er.entity_id  = p_entity_id
    AND er.amount     > 0
    AND TO_CHAR(er.expense_date, 'YYYY-MM') = p_period
    AND er.status NOT IN ('REJECTED','VOID')
  GROUP BY e.id, e.full_name_en, d.dept_name, e.department_id
  ORDER BY e.full_name_en;
$$;
