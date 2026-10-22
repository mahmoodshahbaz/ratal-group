-- ============================================================
-- ACCSYS — Cash Payment Vouchers Schema
-- Run after field_ops_schema.sql
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + IF NOT EXISTS guards
-- ============================================================

CREATE TABLE IF NOT EXISTS cash_payment_vouchers (
  id                  uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id           uuid          REFERENCES entities(id),

  -- Auto-generated voucher number (CPV-YYYYMM-NNNN)
  voucher_number      varchar(30)   UNIQUE,

  payment_date        date          NOT NULL DEFAULT CURRENT_DATE,

  -- ── Party ──────────────────────────────────────────────────
  -- COMPANY   → cr_number + vat_number (optional)
  -- INDIVIDUAL → iqama_number + mobile (optional)
  -- INFORMAL  → name + description only
  party_type          varchar(20)   NOT NULL CHECK (party_type IN ('COMPANY','INDIVIDUAL','INFORMAL')),
  party_name          varchar(200)  NOT NULL,
  party_cr_number     varchar(50),
  party_vat_number    varchar(50),
  party_iqama_number  varchar(20),
  party_mobile        varchar(20),

  -- ── Payment ────────────────────────────────────────────────
  amount              numeric(15,2) NOT NULL CHECK (amount > 0),
  purpose             text          NOT NULL,
  project_ref         varchar(100),
  site_ref            varchar(100),

  -- ── Authorization ──────────────────────────────────────────
  dh_name             varchar(200),
  dh_approval_ref     varchar(100),

  -- ── Documentation ──────────────────────────────────────────
  receipt_type        varchar(30)   NOT NULL
                      CHECK (receipt_type IN ('VAT_INVOICE','SIMPLIFIED_TAX','INFORMAL_RECEIPT','NO_RECEIPT')),
  justification       text,        -- required when NO_RECEIPT or INFORMAL party
  iqama_photo_url     text,        -- Google Drive URL (INDIVIDUAL party)
  document_url        text,        -- Google Drive URL (receipt / invoice scan)

  -- ── Workflow ───────────────────────────────────────────────
  submitted_by_id     uuid          REFERENCES employees(id),
  status              varchar(20)   NOT NULL DEFAULT 'SUBMITTED'
                      CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),

  reviewed_by         uuid          REFERENCES employees(id),
  reviewed_at         timestamptz,
  review_note         text,

  created_at          timestamptz   DEFAULT now(),
  updated_at          timestamptz   DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cpv_date        ON cash_payment_vouchers(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_cpv_party       ON cash_payment_vouchers(party_type, party_name);
CREATE INDEX IF NOT EXISTS idx_cpv_status      ON cash_payment_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_cpv_submitted   ON cash_payment_vouchers(submitted_by_id);
CREATE INDEX IF NOT EXISTS idx_cpv_entity      ON cash_payment_vouchers(entity_id);

-- RLS
ALTER TABLE cash_payment_vouchers ENABLE ROW LEVEL SECURITY;

-- Anon can insert + select (public shareable form)
CREATE POLICY "anon_all_cash_payment_vouchers"
  ON cash_payment_vouchers FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ── Voucher number sequence ─────────────────────────────────
-- RPC: next_cpv_number() → 'CPV-202610-0001'
CREATE OR REPLACE FUNCTION next_cpv_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  prefix text := 'CPV-' || to_char(now(), 'YYYYMM') || '-';
  seq    int;
BEGIN
  SELECT COALESCE(MAX(CAST(RIGHT(voucher_number, 4) AS int)), 0) + 1
    INTO seq
    FROM cash_payment_vouchers
   WHERE voucher_number LIKE prefix || '%';
  RETURN prefix || LPAD(seq::text, 4, '0');
END;
$$;
