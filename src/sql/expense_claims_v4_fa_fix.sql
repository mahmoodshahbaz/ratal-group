-- ============================================================
-- expense_claims_v4_fa_fix.sql
-- Run AFTER expense_claims_v3_project.sql
--
-- Fixes:
--   1. Use expense_records.project_id directly (not site_assignments)
--   2. UPDATE filters by project_id — no more cross-project linking
--   3. Include FA-only employees in generate + preview loops
--   4. total_claimed includes food_allowance total
-- ============================================================

-- ── Drop old functions before redefining ───────────────────
DROP FUNCTION IF EXISTS generate_expense_claims(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS preview_expense_claims(UUID, TEXT);

-- ── Add project_no / project_name to expense_claims if missing ──
-- (idempotent — already added by v3 but safe to repeat)
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS project_no   TEXT,
  ADD COLUMN IF NOT EXISTS project_name TEXT;

-- ── Ensure food_allowances has entity_id ─────────────────────
-- (needed for multi-tenant filtering; skip if already exists)
ALTER TABLE food_allowances
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id);

-- Backfill entity_id from the employee's entity if missing
UPDATE food_allowances fa
SET entity_id = emp.entity_id
FROM employees emp
WHERE fa.employee_id = emp.id
  AND fa.entity_id IS NULL;

-- ── 1. Rewrite generate_expense_claims ──────────────────────
-- Groups by (employee_id, expense_records.project_id)
-- Also includes employees with food_allowances but no expense_records
-- Properly filters UPDATE by project_id

CREATE OR REPLACE FUNCTION generate_expense_claims(
  p_entity_id    UUID,
  p_period       TEXT,           -- e.g. '2026-10'
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
  v_total_exp   NUMERIC(12,2);
  v_total_fa    NUMERIC(12,2);
  v_total       NUMERIC(12,2);
  v_vat         NUMERIC(12,2);
  v_advance     NUMERIC(12,2);
  v_rec_count   INTEGER;
  v_late_count  INTEGER;
  v_generated   INTEGER := 0;
  v_skipped     INTEGER := 0;
  v_result      JSONB   := '[]'::JSONB;
  v_entity_code TEXT;
  v_gen_name    TEXT;
BEGIN
  -- Resolve entity code + generator name
  SELECT entity_code INTO v_entity_code FROM entities WHERE id = p_entity_id;
  v_entity_code := COALESCE(v_entity_code, 'EXP');
  IF p_generated_by IS NOT NULL THEN
    SELECT full_name_en INTO v_gen_name FROM employees WHERE id = p_generated_by;
  END IF;

  -- ── Rolling period window ──────────────────────────────────
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

  -- ── Main loop: one claim per (employee, project) ───────────
  -- UNION: employees with expense_records OR food_allowances in the period
  FOR v_row IN
    SELECT
      combined.employee_id,
      combined.project_id,
      combined.project_no,
      combined.project_name,
      combined.dept_code
    FROM (
      -- Branch A: employees who have unclaimed expense_records
      SELECT
        er.employee_id,
        er.project_id,
        COALESCE(MAX(p.project_number), '—')          AS project_no,
        COALESCE(MAX(p.project_name),   'No Project') AS project_name,
        COALESCE(MAX(d.dept_code), MAX(d.dept_name), '—') AS dept_code
      FROM   expense_records er
      JOIN   employees emp ON emp.id = er.employee_id
      LEFT JOIN departments d   ON d.id = emp.department_id
      LEFT JOIN projects p      ON p.id = er.project_id
      WHERE  er.entity_id  = p_entity_id
        AND  er.claim_id   IS NULL
        AND  er.amount     > 0
        AND  er.expense_date BETWEEN v_from AND v_to
        AND  er.status     NOT IN ('REJECTED', 'VOID')
      GROUP BY er.employee_id, er.project_id

      UNION

      -- Branch B: employees with food_allowances but NO unclaimed expense_records
      SELECT
        fa.employee_id,
        sa.project_id,
        COALESCE(MAX(p.project_number), '—')          AS project_no,
        COALESCE(MAX(p.project_name),   'No Project') AS project_name,
        COALESCE(MAX(d.dept_code), MAX(d.dept_name), '—') AS dept_code
      FROM   food_allowances fa
      JOIN   employees emp ON emp.id = fa.employee_id
      LEFT JOIN departments d   ON d.id = emp.department_id
      LEFT JOIN site_assignments sa
             ON sa.employee_id = fa.employee_id
            AND sa.is_active   = true
      LEFT JOIN projects p ON p.id = sa.project_id
      WHERE  fa.allowance_date BETWEEN v_from AND v_to
        AND  COALESCE(fa.entity_id, p_entity_id) = p_entity_id
        AND  NOT EXISTS (
          -- Skip if this employee already has unclaimed expense_records (handled in Branch A)
          SELECT 1 FROM expense_records er2
          WHERE  er2.employee_id = fa.employee_id
            AND  er2.entity_id   = p_entity_id
            AND  er2.claim_id    IS NULL
            AND  er2.amount      > 0
            AND  er2.expense_date BETWEEN v_from AND v_to
            AND  er2.status      NOT IN ('REJECTED', 'VOID')
        )
      GROUP BY fa.employee_id, sa.project_id
    ) combined
    GROUP BY combined.employee_id, combined.project_id,
             combined.project_no, combined.project_name, combined.dept_code
  LOOP

    -- Skip if claim already exists for this employee+project+period
    IF EXISTS (
      SELECT 1 FROM expense_claims
      WHERE  entity_id   = p_entity_id
        AND  employee_id = v_row.employee_id
        AND  period      = p_period
        AND  (project_id IS NOT DISTINCT FROM v_row.project_id)
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- ── Expense totals — filtered by this project ─────────────
    SELECT
      COALESCE(SUM(er.amount),     0),
      COALESCE(SUM(er.vat_amount), 0),
      COUNT(*),
      COUNT(*) FILTER (WHERE er.late_days > 30)
    INTO v_total_exp, v_vat, v_rec_count, v_late_count
    FROM  expense_records er
    WHERE er.entity_id   = p_entity_id
      AND er.employee_id = v_row.employee_id
      AND (er.project_id IS NOT DISTINCT FROM v_row.project_id)
      AND er.claim_id    IS NULL
      AND er.amount      > 0
      AND er.expense_date BETWEEN v_from AND v_to
      AND er.status      NOT IN ('REJECTED', 'VOID');

    -- ── Food allowance total — for this employee in this period ─
    SELECT COALESCE(SUM(fa.total_amount), 0)
    INTO   v_total_fa
    FROM   food_allowances fa
    WHERE  fa.employee_id   = v_row.employee_id
      AND  fa.allowance_date BETWEEN v_from AND v_to;

    v_total := v_total_exp + v_total_fa;

    -- ── Advances received by this employee in this period ─────
    SELECT COALESCE(SUM(mrl.amount), 0)
    INTO   v_advance
    FROM   money_request_lines mrl
    JOIN   money_requests mr ON mr.id = mrl.money_request_id
    WHERE  mr.entity_id    = p_entity_id
      AND  mr.requested_by = v_row.employee_id
      AND  mr.status       = 'APPROVED'
      AND  mr.created_at::DATE BETWEEN v_from AND v_to;

    -- ── Claim number ──────────────────────────────────────────
    v_claim_num := 'EXP-' || p_period || '-' || v_entity_code || '-'
                || LPAD(nextval('expense_claim_seq')::TEXT, 3, '0');

    INSERT INTO expense_claims (
      entity_id, employee_id, claim_number, period,
      project_id, project_no, project_name,
      department,
      total_sheets,
      total_claimed, total_vat_recoverable,
      total_advances_received, balance_with_employee,
      total_late_entries,
      status, generated_by, generated_by_name, generated_at, submitted_at
    ) VALUES (
      p_entity_id, v_row.employee_id, v_claim_num, p_period,
      v_row.project_id, v_row.project_no, v_row.project_name,
      v_row.dept_code,
      GREATEST(1, CEIL(v_rec_count::NUMERIC / 29)::INTEGER),
      v_total, v_vat,
      v_advance, (v_advance - v_total),
      v_late_count,
      'SUBMITTED', p_generated_by, v_gen_name, now(), now()
    )
    RETURNING id INTO v_claim_id;

    -- ── Link expense_records → this claim (project-filtered) ──
    UPDATE expense_records SET
      claim_id = v_claim_id,
      status   = 'SUBMITTED'
    WHERE entity_id   = p_entity_id
      AND employee_id = v_row.employee_id
      AND (project_id IS NOT DISTINCT FROM v_row.project_id)
      AND claim_id    IS NULL
      AND amount      > 0
      AND expense_date BETWEEN v_from AND v_to
      AND status NOT IN ('REJECTED', 'VOID');

    v_generated := v_generated + 1;
    v_result := v_result || jsonb_build_object(
      'employee_id',    v_row.employee_id,
      'project_no',     v_row.project_no,
      'project_name',   v_row.project_name,
      'claim_id',       v_claim_id,
      'claim_number',   v_claim_num,
      'total',          v_total,
      'total_expenses', v_total_exp,
      'total_fa',       v_total_fa,
      'exp_records',    v_rec_count,
      'sheets',         GREATEST(1, CEIL(v_rec_count::NUMERIC / 29)::INTEGER),
      'late_entries',   v_late_count
    );
  END LOOP;

  RETURN jsonb_build_object(
    'generated', v_generated,
    'skipped',   v_skipped,
    'period',    p_period,
    'from_date', v_from,
    'to_date',   v_to,
    'details',   v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_expense_claims(UUID, TEXT, UUID) TO authenticated;


-- ── 2. Rewrite preview_expense_claims ───────────────────────
-- Same UNION logic as generate — shows both expense+FA employees
-- Returns has_claim = true when a claim already exists for that employee+project+period

CREATE OR REPLACE FUNCTION preview_expense_claims(
  p_entity_id UUID,
  p_period    TEXT
)
RETURNS TABLE (
  employee_id  UUID,
  full_name_en TEXT,
  department   TEXT,
  project_id   UUID,
  project_no   TEXT,
  project_name TEXT,
  record_count INTEGER,
  fa_count     INTEGER,
  total_amount NUMERIC,
  has_claim    BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
WITH period_dates AS (
  SELECT
    CASE WHEN mo = 1 THEN TO_DATE(yr||'-01-01','YYYY-MM-DD')
         ELSE TO_DATE(yr||'-'||LPAD((mo-1)::TEXT,2,'0')||'-26','YYYY-MM-DD')
    END AS v_from,
    CASE WHEN mo = 12 THEN TO_DATE(yr||'-12-31','YYYY-MM-DD')
         ELSE TO_DATE(yr||'-'||LPAD(mo::TEXT,2,'0')||'-25','YYYY-MM-DD')
    END AS v_to
  FROM (SELECT EXTRACT(YEAR  FROM base)::INTEGER AS yr,
               EXTRACT(MONTH FROM base)::INTEGER AS mo
        FROM (SELECT TO_DATE(p_period||'-01','YYYY-MM-DD') AS base) x) y
),
combined AS (
  -- Branch A: expense_records
  SELECT
    er.employee_id,
    er.project_id,
    COUNT(*)::INTEGER                                         AS record_count,
    0::INTEGER                                               AS fa_count,
    COALESCE(SUM(er.amount + COALESCE(er.vat_amount,0)), 0) AS total_amount
  FROM expense_records er, period_dates pd
  WHERE er.entity_id   = p_entity_id
    AND er.claim_id    IS NULL
    AND er.amount      > 0
    AND er.expense_date BETWEEN pd.v_from AND pd.v_to
    AND er.status      NOT IN ('REJECTED', 'VOID')
  GROUP BY er.employee_id, er.project_id

  UNION ALL

  -- Branch B: food_allowances (only where no expense_records exist)
  SELECT
    fa.employee_id,
    sa.project_id,
    0::INTEGER                                               AS record_count,
    COUNT(fa.id)::INTEGER                                   AS fa_count,
    COALESCE(SUM(fa.total_amount), 0)                       AS total_amount
  FROM food_allowances fa
  LEFT JOIN site_assignments sa
         ON sa.employee_id = fa.employee_id AND sa.is_active = true
  CROSS JOIN period_dates pd
  WHERE fa.allowance_date BETWEEN pd.v_from AND pd.v_to
    AND COALESCE(fa.entity_id, p_entity_id) = p_entity_id
    AND NOT EXISTS (
      SELECT 1 FROM expense_records er2
      CROSS JOIN period_dates pd2
      WHERE er2.employee_id = fa.employee_id
        AND er2.entity_id   = p_entity_id
        AND er2.claim_id    IS NULL
        AND er2.amount      > 0
        AND er2.expense_date BETWEEN pd2.v_from AND pd2.v_to
        AND er2.status      NOT IN ('REJECTED','VOID')
    )
  GROUP BY fa.employee_id, sa.project_id
)
SELECT
  c.employee_id,
  COALESCE(emp.full_name_en, emp.full_name, '—')   AS full_name_en,
  COALESCE(d.dept_code, d.dept_name, '—')          AS department,
  c.project_id,
  COALESCE(p.project_number, '—')                  AS project_no,
  COALESCE(p.project_name,   'No Project')         AS project_name,
  SUM(c.record_count)::INTEGER                     AS record_count,
  SUM(c.fa_count)::INTEGER                         AS fa_count,
  SUM(c.total_amount)                              AS total_amount,
  EXISTS (
    SELECT 1 FROM expense_claims ec
    WHERE ec.entity_id   = p_entity_id
      AND ec.employee_id = c.employee_id
      AND ec.period      = p_period
      AND (ec.project_id IS NOT DISTINCT FROM c.project_id)
  )                                                AS has_claim
FROM combined c
JOIN employees emp ON emp.id = c.employee_id
LEFT JOIN departments d ON d.id = emp.department_id
LEFT JOIN projects p    ON p.id = c.project_id
GROUP BY c.employee_id, emp.full_name_en, emp.full_name, d.dept_code, d.dept_name,
         c.project_id, p.project_number, p.project_name
ORDER BY department, full_name_en;
$$;

GRANT EXECUTE ON FUNCTION preview_expense_claims(UUID, TEXT) TO authenticated;
