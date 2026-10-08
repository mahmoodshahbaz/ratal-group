-- ============================================================
-- expense_claims_rls_fix.sql
-- Fix 1: Enable RLS read access on expense_claims so the UI can see records
-- Fix 2: Show dept_code in preview (not full name)
-- ============================================================

-- ── 1. Add RLS policies for expense_claims ─────────────────
-- Authenticated users can read all expense_claims for their entity
-- (entity filtering is already done in the app query)

ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "expense_claims_select" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_insert" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_update" ON expense_claims;

-- Allow authenticated users to SELECT all claims
CREATE POLICY "expense_claims_select"
  ON expense_claims FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to INSERT claims
CREATE POLICY "expense_claims_insert"
  ON expense_claims FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to UPDATE claims (for approvals)
CREATE POLICY "expense_claims_update"
  ON expense_claims FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 2. Create expense_claim_rejections table (if not exists) ──
CREATE TABLE IF NOT EXISTS expense_claim_rejections (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id         UUID        NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  rejected_by      UUID        REFERENCES employees(id),
  rejected_by_name TEXT,
  rejected_at      TIMESTAMPTZ DEFAULT now(),
  reason           TEXT        NOT NULL,
  resubmitted_at   TIMESTAMPTZ,
  round            INTEGER     DEFAULT 1,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecr_claim_id ON expense_claim_rejections(claim_id);

ALTER TABLE expense_claim_rejections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claim_rejections_select" ON expense_claim_rejections;
DROP POLICY IF EXISTS "claim_rejections_insert" ON expense_claim_rejections;
CREATE POLICY "claim_rejections_select"
  ON expense_claim_rejections FOR SELECT TO authenticated USING (true);
CREATE POLICY "claim_rejections_insert"
  ON expense_claim_rejections FOR INSERT TO authenticated WITH CHECK (true);

-- ── 3. Update generate_expense_claims to store dept_code ───
-- Store dept_code (NISU/ITSU/etc) instead of full dept_name
CREATE OR REPLACE FUNCTION generate_expense_claims(
  p_entity_id   UUID,
  p_period      TEXT,
  p_generated_by UUID DEFAULT NULL
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
  SELECT entity_code INTO v_entity_code FROM entities WHERE id = p_entity_id;
  v_entity_code := COALESCE(v_entity_code, 'EXP');

  FOR v_emp IN
    SELECT DISTINCT er.employee_id
    FROM   expense_records er
    WHERE  er.entity_id  = p_entity_id
      AND  er.claim_id   IS NULL
      AND  er.amount     > 0
      AND  TO_CHAR(er.expense_date, 'YYYY-MM') = p_period
      AND  er.status     NOT IN ('REJECTED','VOID')
  LOOP
    IF EXISTS (
      SELECT 1 FROM expense_claims
      WHERE  entity_id   = p_entity_id
        AND  employee_id = v_emp.employee_id
        AND  period      = p_period
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT
      COALESCE(SUM(er.amount), 0),
      COALESCE(SUM(er.vat_amount), 0),
      COUNT(*) FILTER (WHERE er.late_days > 30),
      -- Store dept_code (NISU/ITSU) not full name
      COALESCE(MAX(d.dept_code), MAX(d.dept_name), '—'),
      MAX(p.project_number),
      MAX(p.project_name)
    INTO v_total, v_vat, v_late_count, v_dept, v_proj_no, v_proj_name
    FROM  expense_records er
    JOIN  employees emp            ON emp.id = er.employee_id
    LEFT JOIN departments d        ON d.id = emp.department_id
    LEFT JOIN site_assignments sa  ON sa.employee_id = er.employee_id AND sa.is_active = true
    LEFT JOIN projects p           ON p.id = sa.project_id
    WHERE er.entity_id   = p_entity_id
      AND er.employee_id = v_emp.employee_id
      AND er.claim_id    IS NULL
      AND er.amount       > 0
      AND TO_CHAR(er.expense_date, 'YYYY-MM') = p_period
      AND er.status NOT IN ('REJECTED','VOID');

    SELECT COALESCE(SUM(mrl.amount), 0)
    INTO   v_advance
    FROM   money_request_lines mrl
    JOIN   money_requests mr ON mr.id = mrl.money_request_id
    WHERE  mr.entity_id    = p_entity_id
      AND  mr.requested_by = v_emp.employee_id
      AND  mr.status       = 'APPROVED'
      AND  TO_CHAR(mr.created_at, 'YYYY-MM') = p_period;

    v_claim_num := 'EXP-' || p_period || '-' || v_entity_code || '-'
                || LPAD(nextval('expense_claim_seq')::TEXT, 3, '0');

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
      v_late_count, GREATEST(1, CEIL(
        (SELECT COUNT(*) FROM expense_records
         WHERE entity_id = p_entity_id AND employee_id = v_emp.employee_id
           AND claim_id IS NULL AND amount > 0
           AND TO_CHAR(expense_date,'YYYY-MM') = p_period)::NUMERIC / 30
      )::INTEGER),
      'SUBMITTED', p_generated_by, now(), now()
    )
    RETURNING id INTO v_claim_id;

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

-- ── 4. Update preview to show dept_code too ────────────────
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
    COALESCE(d.dept_code, d.dept_name, '—') AS department,
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
  GROUP BY e.id, e.full_name_en, d.dept_code, d.dept_name, e.department_id
  ORDER BY e.full_name_en;
$$;
