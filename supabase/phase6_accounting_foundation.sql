-- ============================================================
--  PHASE 6: ACCOUNTING FOUNDATION
--  Ratal Group | July 2026
--  Safe to re-run — all statements are idempotent
--
--  Run this entire file in one go in the Supabase SQL Editor.
--
--  Contents:
--    §0  chart_of_accounts — normalise columns + add unique constraint
--    §1  New Chart of Accounts entries
--    §2  journal_entries  (voucher header)
--    §3  journal_lines    (double-entry detail)
--    §4  party_bank_accounts
--    §5  money_requests redesign  (ALTER to add new columns)
--    §6  money_request_lines redesign (ALTER to add new columns)
--    §7  money_received   (Layer 2 — what was handed out)
--    §8  money_distributions (Layer 3 — who got what)
--    §9  saddad_entries   (government payments sub-panel)
--    §10 Helper: fn_set_updated_at()
--    §11 Helper: fn_next_voucher_number()
--    §12 Auto-ledger triggers (employee / contractor / customer)
--    §13 Auto-journal: fn_post_advance_journal()
--    §14 Auto-journal: fn_post_expense_journal()
--    §15 Trigger: money_received → advance journal
--    §16 Trigger: money_distributions PAID → expense journal
--    §17 Year-end close: fn_year_end_close()
--    §18 Indexes
--    §19 RLS
-- ============================================================

-- ────────────────────────────────────────────────────────────────
-- §0  NORMALISE chart_of_accounts
--     The table may have been created from different SQL versions.
--     This block ensures the expected columns exist before §1 inserts.
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Ensure entity_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='entity_id')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN entity_id UUID REFERENCES entities(id);
    END IF;

    -- Ensure account_code exists.
    -- Handles three cases:
    --   a) column is called 'account_no' (live DB quirk) — possibly alongside an empty
    --      'account_code' column added by a previously failed run of this script.
    --   b) column is called 'code'
    --   c) no code column exists at all → add account_code
    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_no')
    THEN
        -- Drop the empty 'account_code' shell added by the failed previous run (if present)
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_code')
        THEN
            ALTER TABLE chart_of_accounts DROP COLUMN account_code;
        END IF;
        ALTER TABLE chart_of_accounts RENAME COLUMN account_no TO account_code;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_code')
    THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='code')
        THEN
            ALTER TABLE chart_of_accounts RENAME COLUMN code TO account_code;
        ELSE
            ALTER TABLE chart_of_accounts ADD COLUMN account_code TEXT;
        END IF;
    END IF;
    -- If account_code already exists and account_no does not: nothing to do.

    -- Ensure account_name exists.
    -- Live table uses 'account_name_en' (NOT NULL).
    -- A failed prior run may have added an empty 'account_name' col alongside it.
    -- Fix: drop the empty shell, rename account_name_en → account_name.
    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_name_en')
    THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_name')
        THEN
            ALTER TABLE chart_of_accounts DROP COLUMN account_name;
        END IF;
        ALTER TABLE chart_of_accounts RENAME COLUMN account_name_en TO account_name;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_name')
    THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='name')
        THEN
            ALTER TABLE chart_of_accounts RENAME COLUMN name TO account_name;
        ELSE
            ALTER TABLE chart_of_accounts ADD COLUMN account_name TEXT;
        END IF;
    END IF;
    -- If account_name exists and account_name_en does not: already correct.

    -- Ensure account_type exists (rename 'type' if present)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='account_type')
    THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='type')
        THEN
            ALTER TABLE chart_of_accounts RENAME COLUMN type TO account_type;
        ELSE
            ALTER TABLE chart_of_accounts ADD COLUMN account_type TEXT;
        END IF;
    END IF;

    -- Ensure is_active exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='is_active')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;

    -- Ensure opening_balance exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='opening_balance')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN opening_balance NUMERIC(14,2) DEFAULT 0;
    END IF;

    -- Ensure notes exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='notes')
    THEN
        ALTER TABLE chart_of_accounts ADD COLUMN notes TEXT;
    END IF;

    -- Add UNIQUE constraint on (entity_id, account_code) if it doesn't exist yet
    -- This is required for ON CONFLICT (entity_id, account_code) to work
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'chart_of_accounts'::regclass
          AND contype = 'u'
          AND conname IN ('chart_of_accounts_entity_id_account_code_key', 'uq_coa_entity_code')
    ) THEN
        -- Remove any duplicates first (keep the oldest row per entity+code pair)
        DELETE FROM chart_of_accounts
        WHERE id NOT IN (
            SELECT DISTINCT ON (COALESCE(entity_id::TEXT, 'NULL'), account_code) id
            FROM chart_of_accounts
            ORDER BY COALESCE(entity_id::TEXT, 'NULL'), account_code, created_at ASC NULLS LAST
        );
        ALTER TABLE chart_of_accounts
            ADD CONSTRAINT uq_coa_entity_code UNIQUE (entity_id, account_code);
    END IF;

    RAISE NOTICE '§0 chart_of_accounts normalised ✓';
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- §1  NEW CHART OF ACCOUNTS
--     Seeds every active entity.  WHERE NOT EXISTS = safe on any schema.
-- ────────────────────────────────────────────────────────────────

-- Service Revenue by Department
INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active)
SELECT e.id, acct.code, acct.name, 'INCOME', TRUE
FROM entities e
CROSS JOIN (VALUES
    ('REV-001', 'Service Revenue — Telecom / Network'),
    ('REV-002', 'Service Revenue — Civil Works'),
    ('REV-003', 'Service Revenue — Fibre & Cabling'),
    ('REV-004', 'Service Revenue — Other / General')
) AS acct(code, name)
WHERE e.is_active = TRUE
ON CONFLICT (entity_id, account_code) DO NOTHING;

-- Additional Expense Accounts
INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active)
SELECT e.id, acct.code, acct.name, 'EXPENSE', TRUE
FROM entities e
CROSS JOIN (VALUES
    ('EXP-005', 'Telecommunications & Internet Expense'),
    ('EXP-006', 'Vehicle, Fuel & Transport Expense')
) AS acct(code, name)
WHERE e.is_active = TRUE
ON CONFLICT (entity_id, account_code) DO NOTHING;

-- Government Accounts
INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active)
SELECT e.id, 'GOV-006', 'Chamber of Commerce Fees', 'GOVERNMENT', TRUE
FROM entities e WHERE e.is_active = TRUE
ON CONFLICT (entity_id, account_code) DO NOTHING;

-- Internal / Clearing
INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active)
SELECT e.id, 'INT-005', 'ATM / Field Card Custodian Account', 'INTERNAL', TRUE
FROM entities e WHERE e.is_active = TRUE
ON CONFLICT (entity_id, account_code) DO NOTHING;

-- Equity (needed for year-end close)
INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active)
SELECT e.id, acct.code, acct.name, 'EQUITY', TRUE
FROM entities e
CROSS JOIN (VALUES
    ('EQU-001', 'Retained Earnings'),
    ('EQU-002', 'Paid-in Capital')
) AS acct(code, name)
WHERE e.is_active = TRUE
ON CONFLICT (entity_id, account_code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- §2  JOURNAL_ENTRIES — voucher header (structured double-entry)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id       UUID        NOT NULL REFERENCES entities(id),
    voucher_number  TEXT        NOT NULL,
    entry_date      DATE        NOT NULL,
    voucher_type    TEXT        NOT NULL DEFAULT 'JV',
    -- JV | ACR | RCL | OPB | ADJ | ADV | EXP | REC | PMT | PAYROLL | CONTRA | CLOSE
    narration       TEXT,
    posted_by       UUID        REFERENCES auth.users(id),
    status          TEXT        NOT NULL DEFAULT 'POSTED',
    -- DRAFT | POSTED | REVERSED | CANCELLED
    source_table    TEXT,
    -- 'receipts' | 'payments' | 'money_requests' | 'money_distributions' | 'expenses'
    source_id       UUID,
    reversal_of     UUID        REFERENCES journal_entries(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_id, voucher_number)
);
-- Backfill columns that may be missing if table was created by a failed prior run
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS narration     TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS posted_by     UUID REFERENCES auth.users(id);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source_table  TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source_id     UUID;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversal_of   UUID REFERENCES journal_entries(id);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- ────────────────────────────────────────────────────────────────
-- §3  JOURNAL_LINES — double-entry detail
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_lines (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id    UUID        NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number         INTEGER,
    account_code        TEXT        NOT NULL,
    account_name        TEXT,
    debit               NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit              NUMERIC(15,2) NOT NULL DEFAULT 0,
    party_type          TEXT,       -- EMPLOYEE | VENDOR | SUBCON | CUSTOMER
    party_id            UUID,
    department          TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_jl_not_both_sides CHECK (NOT (debit > 0 AND credit > 0)),
    CONSTRAINT chk_jl_non_negative   CHECK (debit >= 0 AND credit >= 0)
);
-- Backfill columns that may be missing if table was created by a failed prior run
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS line_number   INTEGER;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS account_name  TEXT;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS party_type    TEXT;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS party_id      UUID;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS department    TEXT;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS notes         TEXT;

-- ────────────────────────────────────────────────────────────────
-- §4  PARTY_BANK_ACCOUNTS — all IBANs in one place
--     party_type: EMPLOYEE | VENDOR | SUBCON | CUSTOMER
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS party_bank_accounts (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id       UUID        NOT NULL REFERENCES entities(id),
    party_type      TEXT        NOT NULL,
    party_id        UUID        NOT NULL,
    iban            TEXT        NOT NULL,
    bank_name       TEXT,
    account_name    TEXT,
    is_primary      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill ALL columns that may be missing if the table was created by a failed prior run
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS party_type   TEXT;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS party_id     UUID;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS iban         TEXT;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS bank_name    TEXT;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS is_primary   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS is_active    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS notes        TEXT;
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE party_bank_accounts ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- Enforce only one primary IBAN per party
CREATE UNIQUE INDEX IF NOT EXISTS uidx_party_bank_primary
    ON party_bank_accounts (entity_id, party_type, party_id)
    WHERE is_primary = TRUE AND is_active = TRUE;

-- ────────────────────────────────────────────────────────────────
-- §5  MONEY_REQUESTS — extend existing table with new columns
--     The table already exists (schema.sql).  We only ADD columns.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS requested_by_user   UUID REFERENCES auth.users(id);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS requestor_role       TEXT;
  -- SUPERVISOR | PROJECT_MANAGER | DEPT_HEAD
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS total_amount         NUMERIC(15,2) DEFAULT 0;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS approved_by_dh       UUID REFERENCES auth.users(id);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS approved_by_dh_at    TIMESTAMPTZ;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS dh_remarks           TEXT;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS gm_notified_at       TIMESTAMPTZ;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS accounts_action_by   UUID REFERENCES auth.users(id);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS accounts_action_at   TIMESTAMPTZ;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS accounts_remarks      TEXT;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS advance_journal_id   UUID REFERENCES journal_entries(id);
-- status values extended:
-- PENDING → DH_APPROVED | DH_REJECTED | DH_SELF
-- → ACCOUNTS_PENDING → ISSUED | PARTIALLY_ISSUED | CANCELLED

-- ────────────────────────────────────────────────────────────────
-- §6  MONEY_REQUEST_LINES — extend existing table with new columns
-- ────────────────────────────────────────────────────────────────
ALTER TABLE money_request_lines ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE money_request_lines ADD COLUMN IF NOT EXISTS expense_type   TEXT;
  -- TRAVEL | MATERIAL | GOVT_FEE | LABOUR | TELECOM | FUEL | OTHER
ALTER TABLE money_request_lines ADD COLUMN IF NOT EXISTS account_code   TEXT;
  -- COA account to charge (EXP-001, GOV-001, etc.)
ALTER TABLE money_request_lines ADD COLUMN IF NOT EXISTS vat_applicable  BOOLEAN DEFAULT FALSE;
ALTER TABLE money_request_lines ADD COLUMN IF NOT EXISTS vat_rate        NUMERIC(5,2) DEFAULT 15.00;
ALTER TABLE money_request_lines ADD COLUMN IF NOT EXISTS vat_amount      NUMERIC(15,2) DEFAULT 0;

-- ────────────────────────────────────────────────────────────────
-- §7  MONEY_RECEIVED — Layer 2: what was actually disbursed
--
--     KEY RULE: Closes on whatever is received.
--     No carry-forward of shortfall.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS money_received (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id           UUID        NOT NULL REFERENCES entities(id),
    money_request_id    UUID        REFERENCES money_requests(id),
    received_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
    received_amount     NUMERIC(15,2) NOT NULL,
    payment_method      TEXT        NOT NULL DEFAULT 'BANK_TRANSFER',
    -- BANK_TRANSFER | CASH | CHEQUE | ATM_CARD
    bank_account        TEXT,       -- source bank: ANB-15 | ANB-39 | ANB-77 | CASH-001
    received_by         UUID        REFERENCES auth.users(id),
    reference           TEXT,
    notes               TEXT,
    status              TEXT        NOT NULL DEFAULT 'OPEN',
    -- OPEN: distributing | CLOSED: all distributed
    advance_journal_id  UUID        REFERENCES journal_entries(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- §8  MONEY_DISTRIBUTIONS — Layer 3: sub-lines per beneficiary
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS money_distributions (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id           UUID        NOT NULL REFERENCES entities(id),
    money_received_id   UUID        REFERENCES money_received(id),
    money_request_id    UUID        REFERENCES money_requests(id),
    distribution_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
    -- Who gets paid
    party_type          TEXT,       -- EMPLOYEE | VENDOR | SUBCON | GOVT | PETTY_CASH
    party_id            UUID,
    party_name          TEXT,       -- denormalized for display
    iban_used           TEXT,
    -- Amounts
    gross_amount        NUMERIC(15,2) NOT NULL,
    vat_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_amount          NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - vat_amount) STORED,
    -- Classification
    purpose             TEXT,
    account_code        TEXT,       -- Dr expense account
    vat_account         TEXT        DEFAULT 'GOV-003',
    -- Government / SADDAD flag
    is_saddad           BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Payment evidence
    reference           TEXT,
    payment_proof_url   TEXT,
    notes               TEXT,
    status              TEXT        NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | PENDING_PAYMENT | PAID | CANCELLED
    expense_journal_id  UUID        REFERENCES journal_entries(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- §9  SADDAD_ENTRIES — government payment sub-panel
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saddad_entries (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id           UUID        NOT NULL REFERENCES entities(id),
    money_request_id    UUID        REFERENCES money_requests(id),
    distribution_id     UUID        REFERENCES money_distributions(id),
    service_type        TEXT        NOT NULL,
    -- IQAMA | CR | VAT | CHAMBER | GOSI | ZAKAT | CUSTOMS | OTHER
    beneficiary_name    TEXT,
    sadad_number        TEXT,
    amount              NUMERIC(15,2) NOT NULL,
    due_date            DATE,
    paid_date           DATE,
    bank_account        TEXT,
    status              TEXT        NOT NULL DEFAULT 'PENDING',
    -- PENDING | PAID | OVERDUE | CANCELLED
    expense_account     TEXT,
    notes               TEXT,
    journal_entry_id    UUID        REFERENCES journal_entries(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- §10  HELPER: fn_set_updated_at()
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$ DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'journal_entries', 'party_bank_accounts',
        'money_received', 'money_distributions', 'saddad_entries'
    ] LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS tr_set_updated_at ON %I;
            CREATE TRIGGER tr_set_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
        ', tbl, tbl);
    END LOOP;
END; $$;

-- ────────────────────────────────────────────────────────────────
-- §11  HELPER: fn_next_voucher_number(entity_id, type)
--      Returns next: 'ADV-2026-0003'
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_next_voucher_number(
    p_entity_id UUID,
    p_type      TEXT
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_year   TEXT := TO_CHAR(NOW(), 'YYYY');
    v_prefix TEXT := p_type || '-' || v_year || '-';
    v_last   INT  := 0;
    v_row    RECORD;
BEGIN
    SELECT voucher_number INTO v_row
    FROM journal_entries
    WHERE entity_id = p_entity_id
      AND voucher_number LIKE v_prefix || '%'
    ORDER BY voucher_number DESC
    LIMIT 1;
    IF FOUND THEN
        v_last := GREATEST(v_last, COALESCE(
            NULLIF(regexp_replace(v_row.voucher_number, '^.*-', ''), '')::INT, 0));
    END IF;

    SELECT voucher_number INTO v_row
    FROM ledger_entries
    WHERE entity_id = p_entity_id
      AND voucher_number LIKE v_prefix || '%'
    ORDER BY voucher_number DESC
    LIMIT 1;
    IF FOUND THEN
        v_last := GREATEST(v_last, COALESCE(
            NULLIF(regexp_replace(v_row.voucher_number, '^.*-', ''), '')::INT, 0));
    END IF;

    RETURN v_prefix || LPAD((v_last + 1)::TEXT, 4, '0');
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- §12  AUTO-LEDGER TRIGGERS
--      New employee/contractor/customer → auto-create COA entry
-- ────────────────────────────────────────────────────────────────

-- 12a. Employee ledger
--   Uses row_to_json to avoid compile-time column name validation.
--   Tries employee_no (from phase1_patch2), then employee_id, then UUID prefix.
CREATE OR REPLACE FUNCTION fn_auto_ledger_employee()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_row  JSON;
    v_code TEXT;
    v_name TEXT;
BEGIN
    v_row  := row_to_json(NEW);
    v_code := NULLIF(TRIM(COALESCE(v_row->>'employee_no', '')), '');
    IF v_code IS NULL THEN
        v_code := NULLIF(TRIM(COALESCE(v_row->>'employee_id', '')), '');
    END IF;
    IF v_code IS NULL THEN
        v_code := 'EMP-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 8));
    END IF;
    v_name := COALESCE(NULLIF(TRIM(v_row->>'full_name_en'), ''), v_code);
    INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active, notes)
    VALUES (NEW.entity_id, v_code, v_name, 'EMPLOYEE', TRUE, 'Auto-created on employee insert')
    ON CONFLICT (entity_id, account_code) DO UPDATE
        SET account_name = EXCLUDED.account_name;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_auto_ledger_employee ON employees;
CREATE TRIGGER tr_auto_ledger_employee
AFTER INSERT OR UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION fn_auto_ledger_employee();

-- 12b. Contractor / subcontractor ledger
CREATE OR REPLACE FUNCTION fn_auto_ledger_contractor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_prefix    TEXT;
    v_acct_code TEXT;
    v_acct_type TEXT;
    v_name      TEXT;
BEGIN
    v_name := COALESCE(NEW.company_name, NEW.contractor_name);
    IF v_name IS NULL THEN RETURN NEW; END IF;

    IF COALESCE(NEW.vendor_type, '') = 'SUB_CONTRACTOR' THEN
        v_acct_type := 'SUBCON';   v_prefix := 'SUB-';
    ELSE
        v_acct_type := 'CONTRACTOR'; v_prefix := 'VEN-';
    END IF;

    v_acct_code := COALESCE(
        NULLIF(TRIM(COALESCE(NEW.contractor_code, '')), ''),
        v_prefix || UPPER(SUBSTRING(NEW.id::TEXT, 1, 6))
    );

    INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active, notes)
    VALUES (NEW.entity_id, v_acct_code, v_name, v_acct_type, TRUE,
            'Auto-created on contractor insert')
    ON CONFLICT (entity_id, account_code) DO UPDATE
        SET account_name = EXCLUDED.account_name, account_type = EXCLUDED.account_type;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_auto_ledger_contractor ON contractors;
CREATE TRIGGER tr_auto_ledger_contractor
AFTER INSERT OR UPDATE ON contractors
FOR EACH ROW EXECUTE FUNCTION fn_auto_ledger_contractor();

-- 12c. Customer ledger
CREATE OR REPLACE FUNCTION fn_auto_ledger_customer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_code TEXT;
BEGIN
    v_code := COALESCE(
        NULLIF(TRIM(COALESCE(NEW.account_no, '')), ''),
        'CUS-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 6))
    );
    INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_type, is_active, notes)
    VALUES (NEW.entity_id, v_code, COALESCE(NEW.name_en, v_code), 'CUSTOMER', TRUE,
            'Auto-created on customer insert')
    ON CONFLICT (entity_id, account_code) DO UPDATE
        SET account_name = EXCLUDED.account_name;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_auto_ledger_customer ON customers;
CREATE TRIGGER tr_auto_ledger_customer
AFTER INSERT OR UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION fn_auto_ledger_customer();

-- ────────────────────────────────────────────────────────────────
-- §13  AUTO-JOURNAL: fn_post_advance_journal(money_received_id)
--
--      Dr  INT-003  Advance Paid / Clearing     [received_amount]
--      Cr  {bank}   e.g. ANB-15                 [received_amount]
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_post_advance_journal(p_received_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_rec       money_received%ROWTYPE;
    v_jid       UUID;
    v_vno       TEXT;
    v_bank_name TEXT;
    v_purpose   TEXT;
BEGIN
    SELECT * INTO v_rec FROM money_received WHERE id = p_received_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'money_received % not found', p_received_id; END IF;
    IF v_rec.advance_journal_id IS NOT NULL THEN RETURN v_rec.advance_journal_id; END IF;

    IF v_rec.money_request_id IS NOT NULL THEN
        SELECT purpose INTO v_purpose FROM money_requests WHERE id = v_rec.money_request_id;
    END IF;
    v_purpose := COALESCE(v_purpose, 'Cash advance');
    v_vno     := fn_next_voucher_number(v_rec.entity_id, 'ADV');

    SELECT account_name INTO v_bank_name FROM chart_of_accounts
    WHERE entity_id = v_rec.entity_id AND account_code = v_rec.bank_account LIMIT 1;

    INSERT INTO journal_entries (entity_id, voucher_number, entry_date, voucher_type, narration,
        status, source_table, source_id)
    VALUES (v_rec.entity_id, v_vno, v_rec.received_date, 'ADV',
            'Advance issued: ' || v_purpose, 'POSTED', 'money_received', p_received_id)
    RETURNING id INTO v_jid;

    INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name, debit, credit, notes)
    VALUES
        (v_jid, 1, 'INT-003', 'Advance Paid',
         v_rec.received_amount, 0, 'Advance for: ' || v_purpose),
        (v_jid, 2, v_rec.bank_account, COALESCE(v_bank_name, v_rec.bank_account),
         0, v_rec.received_amount, 'Paid from ' || COALESCE(v_rec.bank_account, '?'));

    INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
        account_code, account_name, debit, credit, description)
    VALUES
        (v_rec.entity_id, v_rec.received_date, 'ADV', v_vno,
         'INT-003', 'Advance Paid', v_rec.received_amount, 0, 'Advance: ' || v_purpose),
        (v_rec.entity_id, v_rec.received_date, 'ADV', v_vno,
         v_rec.bank_account, COALESCE(v_bank_name, v_rec.bank_account),
         0, v_rec.received_amount, 'Paid from ' || COALESCE(v_rec.bank_account, '?'));

    UPDATE money_received SET advance_journal_id = v_jid WHERE id = p_received_id;
    IF v_rec.money_request_id IS NOT NULL THEN
        UPDATE money_requests SET advance_journal_id = v_jid, status = 'ISSUED'
        WHERE id = v_rec.money_request_id;
    END IF;
    RETURN v_jid;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- §14  AUTO-JOURNAL: fn_post_expense_journal(distribution_id)
--
--      Dr  {account_code}   Expense account      [net_amount]
--      Dr  GOV-003          VAT Input Recov.     [vat_amount]  (if VAT > 0)
--      Cr  INT-003          Advance Paid/Clear.  [gross_amount]
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_post_expense_journal(p_dist_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_dist      money_distributions%ROWTYPE;
    v_jid       UUID;
    v_vno       TEXT;
    v_exp_name  TEXT;
    v_narr      TEXT;
BEGIN
    SELECT * INTO v_dist FROM money_distributions WHERE id = p_dist_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'money_distributions % not found', p_dist_id; END IF;
    IF v_dist.expense_journal_id IS NOT NULL THEN RETURN v_dist.expense_journal_id; END IF;
    IF v_dist.status != 'PAID' THEN
        RAISE EXCEPTION 'Cannot post journal for distribution % — status is %', p_dist_id, v_dist.status;
    END IF;

    v_vno := fn_next_voucher_number(v_dist.entity_id, 'EXP');
    SELECT account_name INTO v_exp_name FROM chart_of_accounts
    WHERE entity_id = v_dist.entity_id AND account_code = v_dist.account_code LIMIT 1;
    v_narr := COALESCE(v_dist.purpose, 'Expense — ' || COALESCE(v_dist.party_name, v_dist.party_type));

    INSERT INTO journal_entries (entity_id, voucher_number, entry_date, voucher_type, narration,
        status, source_table, source_id)
    VALUES (v_dist.entity_id, v_vno, v_dist.distribution_date, 'EXP',
            v_narr, 'POSTED', 'money_distributions', p_dist_id)
    RETURNING id INTO v_jid;

    INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name,
        debit, credit, party_type, party_id, notes)
    VALUES (v_jid, 1, COALESCE(v_dist.account_code, 'EXP-002'),
            COALESCE(v_exp_name, 'Expense'), v_dist.net_amount, 0,
            v_dist.party_type, v_dist.party_id, v_narr);

    IF v_dist.vat_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name,
            debit, credit, notes)
        VALUES (v_jid, 2, COALESCE(v_dist.vat_account, 'GOV-003'),
                'VAT Input Recoverable', v_dist.vat_amount, 0, '15% VAT on ' || v_narr);
    END IF;

    INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name,
        debit, credit, notes)
    VALUES (v_jid, CASE WHEN v_dist.vat_amount > 0 THEN 3 ELSE 2 END,
            'INT-003', 'Advance Paid', 0, v_dist.gross_amount, 'Clear advance: ' || v_narr);

    -- Mirror to flat GL
    INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
        account_code, account_name, debit, credit, description)
    VALUES
        (v_dist.entity_id, v_dist.distribution_date, 'EXP', v_vno,
         COALESCE(v_dist.account_code, 'EXP-002'), COALESCE(v_exp_name, 'Expense'),
         v_dist.net_amount, 0, v_narr);

    IF v_dist.vat_amount > 0 THEN
        INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
            account_code, account_name, debit, credit, description)
        VALUES (v_dist.entity_id, v_dist.distribution_date, 'EXP', v_vno,
                COALESCE(v_dist.vat_account, 'GOV-003'), 'VAT Input Recoverable',
                v_dist.vat_amount, 0, '15% VAT on ' || v_narr);
    END IF;

    INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
        account_code, account_name, debit, credit, description)
    VALUES (v_dist.entity_id, v_dist.distribution_date, 'EXP', v_vno,
            'INT-003', 'Advance Paid', 0, v_dist.gross_amount, 'Clear advance: ' || v_narr);

    UPDATE money_distributions SET expense_journal_id = v_jid WHERE id = p_dist_id;
    RETURN v_jid;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- §15  TRIGGER: money_received INSERT → post advance journal
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tr_fn_money_received_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_post_advance_journal(NEW.id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_post_advance_journal failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_money_received_journal ON money_received;
CREATE TRIGGER tr_money_received_journal
AFTER INSERT ON money_received
FOR EACH ROW EXECUTE FUNCTION tr_fn_money_received_journal();

-- ────────────────────────────────────────────────────────────────
-- §16  TRIGGER: money_distributions status → PAID → expense journal
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tr_fn_distribution_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'PAID' AND (OLD.status IS DISTINCT FROM 'PAID') THEN
        PERFORM fn_post_expense_journal(NEW.id);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_post_expense_journal failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_distribution_journal ON money_distributions;
CREATE TRIGGER tr_distribution_journal
AFTER UPDATE OF status ON money_distributions
FOR EACH ROW EXECUTE FUNCTION tr_fn_distribution_journal();

-- ────────────────────────────────────────────────────────────────
-- §17  YEAR-END CLOSE: fn_year_end_close(entity_id, year)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_year_end_close(p_entity_id UUID, p_year INT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_close_date  DATE := (p_year || '-12-31')::DATE;
    v_year_start  DATE := (p_year || '-01-01')::DATE;
    v_vno         TEXT;
    v_jid         UUID;
    v_line_no     INT  := 1;
    v_total_inc   NUMERIC(15,2) := 0;
    v_total_exp   NUMERIC(15,2) := 0;
    v_net         NUMERIC(15,2);
    r             RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM journal_entries
        WHERE entity_id = p_entity_id AND voucher_type = 'CLOSE' AND entry_date = v_close_date)
    THEN
        RAISE EXCEPTION 'Year-end close for % already exists for entity %', p_year, p_entity_id;
    END IF;

    v_vno := fn_next_voucher_number(p_entity_id, 'CLOSE');
    INSERT INTO journal_entries (entity_id, voucher_number, entry_date, voucher_type, narration, status)
    VALUES (p_entity_id, v_vno, v_close_date, 'CLOSE',
            'Year-end close ' || p_year || ' — P&L to Retained Earnings', 'POSTED')
    RETURNING id INTO v_jid;

    FOR r IN
        SELECT le.account_code, MAX(ca.account_name) AS acct_name,
               SUM(le.credit - le.debit) AS net_cr
        FROM ledger_entries le
        JOIN chart_of_accounts ca ON ca.entity_id = le.entity_id AND ca.account_code = le.account_code
        WHERE le.entity_id = p_entity_id AND ca.account_type = 'INCOME'
          AND le.entry_date BETWEEN v_year_start AND v_close_date
        GROUP BY le.account_code HAVING SUM(le.credit - le.debit) <> 0
    LOOP
        IF r.net_cr > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name, debit, credit, notes)
            VALUES (v_jid, v_line_no, r.account_code, r.acct_name, r.net_cr, 0, 'Year-end close');
            INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
                account_code, account_name, debit, credit, description)
            VALUES (p_entity_id, v_close_date, 'CLOSE', v_vno,
                r.account_code, r.acct_name, r.net_cr, 0, 'Year-end close ' || p_year);
            v_line_no   := v_line_no + 1;
            v_total_inc := v_total_inc + r.net_cr;
        END IF;
    END LOOP;

    FOR r IN
        SELECT le.account_code, MAX(ca.account_name) AS acct_name,
               SUM(le.debit - le.credit) AS net_dr
        FROM ledger_entries le
        JOIN chart_of_accounts ca ON ca.entity_id = le.entity_id AND ca.account_code = le.account_code
        WHERE le.entity_id = p_entity_id AND ca.account_type IN ('EXPENSE', 'GOVERNMENT')
          AND le.entry_date BETWEEN v_year_start AND v_close_date
        GROUP BY le.account_code HAVING SUM(le.debit - le.credit) <> 0
    LOOP
        IF r.net_dr > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name, debit, credit, notes)
            VALUES (v_jid, v_line_no, r.account_code, r.acct_name, 0, r.net_dr, 'Year-end close');
            INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
                account_code, account_name, debit, credit, description)
            VALUES (p_entity_id, v_close_date, 'CLOSE', v_vno,
                r.account_code, r.acct_name, 0, r.net_dr, 'Year-end close ' || p_year);
            v_line_no   := v_line_no + 1;
            v_total_exp := v_total_exp + r.net_dr;
        END IF;
    END LOOP;

    v_net := v_total_inc - v_total_exp;
    IF v_net > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name, debit, credit, notes)
        VALUES (v_jid, v_line_no, 'EQU-001', 'Retained Earnings', 0, v_net, 'Net profit ' || p_year);
        INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
            account_code, account_name, debit, credit, description)
        VALUES (p_entity_id, v_close_date, 'CLOSE', v_vno,
            'EQU-001', 'Retained Earnings', 0, v_net, 'Net profit year-end ' || p_year);
    ELSIF v_net < 0 THEN
        INSERT INTO journal_lines (journal_entry_id, line_number, account_code, account_name, debit, credit, notes)
        VALUES (v_jid, v_line_no, 'EQU-001', 'Retained Earnings', ABS(v_net), 0, 'Net loss ' || p_year);
        INSERT INTO ledger_entries (entity_id, entry_date, voucher_type, voucher_number,
            account_code, account_name, debit, credit, description)
        VALUES (p_entity_id, v_close_date, 'CLOSE', v_vno,
            'EQU-001', 'Retained Earnings', ABS(v_net), 0, 'Net loss year-end ' || p_year);
    END IF;

    RAISE NOTICE 'Year-end close %: Income=%, Expense=%, Net=%, Voucher=%',
        p_year, v_total_inc, v_total_exp, v_net, v_vno;
    RETURN v_jid;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- §18  INDEXES
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_je_entity_date    ON journal_entries    (entity_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_source         ON journal_entries    (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_jl_entry          ON journal_lines      (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account        ON journal_lines      (account_code);
CREATE INDEX IF NOT EXISTS idx_pba_party         ON party_bank_accounts(entity_id, party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_mrecd_entity      ON money_received     (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_mrecd_request     ON money_received     (money_request_id);
CREATE INDEX IF NOT EXISTS idx_mdist_entity      ON money_distributions(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_mdist_received    ON money_distributions(money_received_id);
CREATE INDEX IF NOT EXISTS idx_mdist_party       ON money_distributions(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_saddad_entity     ON saddad_entries     (entity_id, status);

-- ────────────────────────────────────────────────────────────────
-- §19  RLS — basic authenticated access on all new tables
-- ────────────────────────────────────────────────────────────────
DO $$ DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'journal_entries', 'journal_lines', 'party_bank_accounts',
        'money_received', 'money_distributions', 'saddad_entries'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS pol_%I_auth ON %I;', tbl, tbl);
        EXECUTE format('
            CREATE POLICY pol_%I_auth ON %I
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
        ', tbl, tbl);
    END LOOP;
END; $$;

-- ────────────────────────────────────────────────────────────────
-- DONE ✓
-- Quick tests:
--   SELECT column_name FROM information_schema.columns WHERE table_name='chart_of_accounts';
--   SELECT fn_next_voucher_number('<entity_id>'::UUID, 'ADV');
-- ────────────────────────────────────────────────────────────────
