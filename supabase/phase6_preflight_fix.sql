-- ============================================================
--  PHASE 6 PRE-FLIGHT FIX
--  Run this FIRST, then run phase6_accounting_foundation.sql
--
--  What this does:
--    1. Removes the empty columns accidentally added by the
--       previous failed run of phase6_accounting_foundation
--    2. Renames the real columns to the names the app expects
--    3. Adds the UNIQUE constraint needed for ON CONFLICT
-- ============================================================

DO $$
DECLARE
    v_col TEXT;
BEGIN
    RAISE NOTICE 'Starting pre-flight fix for chart_of_accounts...';

    -- ──────────────────────────────────────────────────────────────
    -- FIX 1: account_code column
    --   The live table uses "account_no" for the account identifier.
    --   The previous run added an empty "account_code" column.
    --   Fix: drop the empty one, rename account_no → account_code.
    -- ──────────────────────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_no')
    THEN
        -- Drop the empty column added by the failed run (if it exists)
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_code')
        THEN
            ALTER TABLE chart_of_accounts DROP COLUMN account_code;
            RAISE NOTICE 'Dropped empty account_code column ✓';
        END IF;
        -- Rename the real column
        ALTER TABLE chart_of_accounts RENAME COLUMN account_no TO account_code;
        RAISE NOTICE 'Renamed account_no → account_code ✓';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='code')
    THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_code')
        THEN
            ALTER TABLE chart_of_accounts DROP COLUMN account_code;
        END IF;
        ALTER TABLE chart_of_accounts RENAME COLUMN code TO account_code;
        RAISE NOTICE 'Renamed code → account_code ✓';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_code')
    THEN
        RAISE NOTICE 'account_code already correct — skipped ✓';
    ELSE
        ALTER TABLE chart_of_accounts ADD COLUMN account_code TEXT;
        RAISE NOTICE 'Added account_code column (no existing code column found) ✓';
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- FIX 2: account_name column
    --   Check if an empty account_name was added by the failed run,
    --   and whether the original table had a differently-named name col.
    -- ──────────────────────────────────────────────────────────────

    -- account_name: live table uses 'account_name_en' (NOT NULL).
    -- A previously failed run may have added an empty 'account_name' column.
    -- Fix: drop the empty shell, rename account_name_en → account_name.
    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_name_en')
    THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_name')
        THEN
            ALTER TABLE chart_of_accounts DROP COLUMN account_name;
            RAISE NOTICE 'Dropped empty account_name column ✓';
        END IF;
        ALTER TABLE chart_of_accounts RENAME COLUMN account_name_en TO account_name;
        RAISE NOTICE 'Renamed account_name_en → account_name ✓';
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_name')
    THEN
        -- Check other common alternatives
        SELECT column_name INTO v_col
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chart_of_accounts'
          AND column_name IN ('acct_name', 'ledger_name', 'name_en', 'name')
        LIMIT 1;
        IF v_col IS NOT NULL THEN
            ALTER TABLE chart_of_accounts RENAME COLUMN v_col TO account_name;
            RAISE NOTICE 'Renamed % → account_name ✓', v_col;
        ELSE
            ALTER TABLE chart_of_accounts ADD COLUMN account_name TEXT;
            RAISE NOTICE 'Added account_name column ✓';
        END IF;
    ELSE
        RAISE NOTICE 'account_name already correct — skipped ✓';
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- FIX 3: account_type column
    -- ──────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_type')
    THEN
        SELECT column_name INTO v_col FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts'
          AND column_name IN ('type', 'acct_type', 'ledger_type') LIMIT 1;
        IF v_col IS NOT NULL THEN
            ALTER TABLE chart_of_accounts RENAME COLUMN v_col TO account_type;
            RAISE NOTICE 'Renamed % → account_type ✓', v_col;
        ELSE
            ALTER TABLE chart_of_accounts ADD COLUMN account_type TEXT;
            RAISE NOTICE 'Added account_type column ✓';
        END IF;
    ELSE
        RAISE NOTICE 'account_type already correct — skipped ✓';
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- FIX 4: is_active column
    -- ──────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='is_active')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        RAISE NOTICE 'Added is_active column ✓';
    ELSE
        RAISE NOTICE 'is_active already correct — skipped ✓';
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- FIX 5: entity_id column (ensure it exists)
    -- ──────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='entity_id')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN entity_id UUID REFERENCES entities(id);
        RAISE NOTICE 'Added entity_id column ✓';
    ELSE
        RAISE NOTICE 'entity_id already correct — skipped ✓';
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- FIX 6: notes column
    -- ──────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='notes')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN notes TEXT;
        RAISE NOTICE 'Added notes column ✓';
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- FIX 7: opening_balance column
    -- ──────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='opening_balance')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN opening_balance NUMERIC(14,2) DEFAULT 0;
        RAISE NOTICE 'Added opening_balance column ✓';
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- FIX 8: UNIQUE constraint on (entity_id, account_code)
    --   Required so ON CONFLICT (entity_id, account_code) works.
    -- ──────────────────────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'chart_of_accounts'::regclass
          AND contype = 'u'
          AND (conname = 'uq_coa_entity_code'
            OR conname = 'chart_of_accounts_entity_id_account_code_key')
    ) THEN
        -- Deduplicate first (keep oldest per entity+code pair)
        DELETE FROM chart_of_accounts
        WHERE id NOT IN (
            SELECT DISTINCT ON (COALESCE(entity_id::TEXT,'NULL'), account_code) id
            FROM chart_of_accounts
            WHERE account_code IS NOT NULL
            ORDER BY COALESCE(entity_id::TEXT,'NULL'), account_code, created_at ASC NULLS LAST
        );
        ALTER TABLE chart_of_accounts
            ADD CONSTRAINT uq_coa_entity_code UNIQUE (entity_id, account_code);
        RAISE NOTICE 'Added UNIQUE constraint on (entity_id, account_code) ✓';
    ELSE
        RAISE NOTICE 'UNIQUE constraint already exists — skipped ✓';
    END IF;

    RAISE NOTICE 'Pre-flight fix complete. Now run phase6_accounting_foundation.sql';
END;
$$;

-- Show the final column state so you can verify before running the main patch
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'chart_of_accounts'
ORDER BY ordinal_position;
