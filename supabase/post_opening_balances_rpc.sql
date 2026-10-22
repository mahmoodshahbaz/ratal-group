-- ════════════════════════════════════════════════════════════════════════
-- post_opening_balances(p_entity_id uuid)
--
-- Creates Journal Entries for all unposted Opening Balance rows.
--
-- Balance type → DR/CR mapping:
--   ADVANCE_GIVEN      DR Advance Account      / CR Opening Balance Equity
--   LOAN_GIVEN         DR Loan Account          / CR Opening Balance Equity
--   PETTY_CASH_FLOAT   DR Petty Cash Account    / CR Opening Balance Equity
--   AR_OUTSTANDING     DR Accounts Receivable   / CR Opening Balance Equity
--   SALARY_PAYABLE     DR Opening Balance Equity / CR Salary Payable
--   AP_OUTSTANDING     DR Opening Balance Equity / CR Accounts Payable
--   RETENTION_HELD     DR Opening Balance Equity / CR Retention Payable
--   OTHER              DR Opening Balance Equity / CR Suspense Account
--
-- Prerequisites:
--   • chart_of_accounts must have an account with code 'OPB-EQUITY' per entity
--     (the Opening Balance Equity contra account)
--   • Each balance_type should have a corresponding account code in the
--     COA seeded via sample_coa.sql. If not found, the code/name is used
--     literally (still creates a valid JE line for manual reconciliation).
--
-- Run once in Supabase SQL Editor to create the function.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION post_opening_balances(p_entity_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ob          RECORD;
  v_je_id       UUID;
  v_je_number   TEXT;
  v_counter     INT;
  v_posted      INT := 0;
  v_failed      INT := 0;
  v_errors      TEXT[] := ARRAY[]::TEXT[];

  -- DR-types: company holds the asset (debit the ledger, credit equity)
  DR_TYPES      TEXT[] := ARRAY['ADVANCE_GIVEN','LOAN_GIVEN','PETTY_CASH_FLOAT','AR_OUTSTANDING'];

  -- Account code lookup helpers
  v_ledger_code TEXT;
  v_ledger_name TEXT;
  v_ledger_id   UUID;
  v_equity_code TEXT := 'OPB-EQUITY';
  v_equity_name TEXT := 'Opening Balance Equity';
  v_equity_id   UUID;

BEGIN
  -- ── Resolve equity account for this entity ──────────────────────────────────
  SELECT id, account_name
    INTO v_equity_id, v_equity_name
    FROM chart_of_accounts
   WHERE entity_id = p_entity_id
     AND account_code = v_equity_code
   LIMIT 1;

  -- ── Balance-type → ledger account code mapping ──────────────────────────────
  -- Used when the COA has these standard codes seeded.
  -- Falls back gracefully to descriptive code if not found.

  -- ── Loop: one JE per opening balance row ────────────────────────────────────
  FOR v_ob IN
    SELECT *
      FROM opening_balances
     WHERE entity_id = p_entity_id
       AND je_posted = FALSE
     ORDER BY as_of_date, party_code
  LOOP
    BEGIN
      -- 1. Resolve ledger account code for this balance_type
      v_ledger_code := CASE v_ob.balance_type
        WHEN 'ADVANCE_GIVEN'    THEN '1300-ADV'
        WHEN 'LOAN_GIVEN'       THEN '1310-LOAN'
        WHEN 'PETTY_CASH_FLOAT' THEN '1110-CASH'
        WHEN 'AR_OUTSTANDING'   THEN '1200-AR'
        WHEN 'SALARY_PAYABLE'   THEN '2100-SAL'
        WHEN 'AP_OUTSTANDING'   THEN '2200-AP'
        WHEN 'RETENTION_HELD'   THEN '2300-RET'
        ELSE '9999-SUSP'        -- Suspense for OTHER
      END;

      v_ledger_name := CASE v_ob.balance_type
        WHEN 'ADVANCE_GIVEN'    THEN 'Advances — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
        WHEN 'LOAN_GIVEN'       THEN 'Employee Loans — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
        WHEN 'PETTY_CASH_FLOAT' THEN 'Petty Cash Float — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
        WHEN 'AR_OUTSTANDING'   THEN 'Accounts Receivable — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
        WHEN 'SALARY_PAYABLE'   THEN 'Salary Payable — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
        WHEN 'AP_OUTSTANDING'   THEN 'Accounts Payable — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
        WHEN 'RETENTION_HELD'   THEN 'Retention Payable — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
        ELSE 'Suspense — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Opening')
      END;

      -- Look up the account ID from COA (optional — JE line is still valid without it)
      SELECT id INTO v_ledger_id
        FROM chart_of_accounts
       WHERE entity_id = p_entity_id
         AND account_code = v_ledger_code
       LIMIT 1;

      -- 2. Generate sequential JE number: OB-YYYY-NNNN
      SELECT COUNT(*) + 1 INTO v_counter
        FROM journal_entries
       WHERE entity_id = p_entity_id
         AND entry_number LIKE 'OB-' || TO_CHAR(v_ob.as_of_date,'YYYY') || '-%';

      v_je_number := 'OB-' || TO_CHAR(v_ob.as_of_date,'YYYY') || '-' || LPAD(v_counter::TEXT, 4, '0');

      -- 3. Create JE header
      INSERT INTO journal_entries (
        entity_id, entry_number, entry_date, period,
        narration, status, source_type, source_id
      ) VALUES (
        p_entity_id,
        v_je_number,
        v_ob.as_of_date,
        TO_CHAR(v_ob.as_of_date, 'YYYY-MM'),
        'Opening Balance — ' || v_ob.balance_type || ' — ' || COALESCE(v_ob.party_name, v_ob.party_code, 'Unspecified'),
        'POSTED',
        'OPENING_BALANCE',
        v_ob.id
      )
      RETURNING id INTO v_je_id;

      -- 4. Create two JE lines (always balanced)
      IF v_ob.balance_type = ANY(DR_TYPES) THEN
        -- DR ledger account, CR Opening Balance Equity
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_code, account_name, debit_amount, credit_amount, description)
        VALUES (v_je_id, v_ledger_id, v_ledger_code, v_ledger_name, v_ob.amount, 0,
                'OB DR: ' || COALESCE(v_ob.party_name, v_ob.party_code, ''));

        INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_code, account_name, debit_amount, credit_amount, description)
        VALUES (v_je_id, v_equity_id, v_equity_code, v_equity_name, 0, v_ob.amount,
                'OB CR Equity: ' || COALESCE(v_ob.party_name, v_ob.party_code, ''));
      ELSE
        -- CR ledger account, DR Opening Balance Equity
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_code, account_name, debit_amount, credit_amount, description)
        VALUES (v_je_id, v_equity_id, v_equity_code, v_equity_name, v_ob.amount, 0,
                'OB DR Equity: ' || COALESCE(v_ob.party_name, v_ob.party_code, ''));

        INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_code, account_name, debit_amount, credit_amount, description)
        VALUES (v_je_id, v_ledger_id, v_ledger_code, v_ledger_name, 0, v_ob.amount,
                'OB CR: ' || COALESCE(v_ob.party_name, v_ob.party_code, ''));
      END IF;

      -- 5. Mark opening balance as posted
      UPDATE opening_balances
         SET je_posted  = TRUE,
             je_id      = v_je_id,
             posted_at  = NOW(),
             posted_by  = auth.uid()
       WHERE id = v_ob.id;

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || (COALESCE(v_ob.party_code, v_ob.id::TEXT) || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'posted',  v_posted,
    'failed',  v_failed,
    'errors',  to_jsonb(v_errors)
  );
END;
$$;

-- Grant execute to authenticated users (SUPERADMIN check is enforced in the UI)
GRANT EXECUTE ON FUNCTION post_opening_balances(UUID) TO authenticated;

-- ── Supporting COA entries (run once to seed required accounts) ────────────────
-- These accounts must exist for the JE lines to have proper account_ids.
-- If you already have these codes in your COA, skip this block.
-- Adjust account codes to match your Chart of Accounts numbering.

/*
-- Run this only if you need to seed the standard OB accounts:

INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system, sort_order)
SELECT
  e.id,
  t.code, t.name, t.type, t.subtype, t.normal, true, t.sort
FROM entities e
CROSS JOIN (VALUES
  ('OPB-EQUITY', 'Opening Balance Equity',    'EQUITY',    'EQUITY',            'CREDIT', 1000),
  ('1110-CASH',  'Petty Cash',                'ASSET',     'CURRENT_ASSET',     'DEBIT',  1010),
  ('1200-AR',    'Accounts Receivable',        'ASSET',     'CURRENT_ASSET',     'DEBIT',  1020),
  ('1300-ADV',   'Employee / Party Advances',  'ASSET',     'CURRENT_ASSET',     'DEBIT',  1030),
  ('1310-LOAN',  'Employee Loans',             'ASSET',     'CURRENT_ASSET',     'DEBIT',  1040),
  ('2100-SAL',   'Salary Payable',             'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', 2010),
  ('2200-AP',    'Accounts Payable',           'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', 2020),
  ('2300-RET',   'Retention Payable',          'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', 2030),
  ('9999-SUSP',  'Suspense Account',           'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', 9000)
) AS t(code, name, type, subtype, normal, sort)
ON CONFLICT (entity_id, account_code) DO NOTHING;
*/
