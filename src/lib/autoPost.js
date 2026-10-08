/**
 * autoPost.js — Double-entry auto-posting engine
 *
 * Called silently after Invoice issued, Payment Receipt saved, Payment approved.
 * Users never see Dr/Cr; journal entries are written automatically.
 *
 * Usage:
 *   import { postInvoiceJE, postReceiptJE, postPaymentOutJE } from '../lib/autoPost'
 */

import { supabase } from './supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate next sequential entry number: JE-2026-0001 */
async function nextEntryNumber(entityId) {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .eq('entity_id', entityId)
    .like('entry_number', `JE-${year}-%`)
    .order('entry_number', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return `JE-${year}-0001`
  const last = data[0].entry_number                  // e.g. JE-2026-0007
  const parts = last.split('-')
  const seq   = parseInt(parts[parts.length - 1] || '0') + 1
  return `JE-${year}-${String(seq).padStart(4, '0')}`
}

/** Resolve account_code → {id, account_name} map for this entity */
async function resolveAccounts(entityId, codes) {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('entity_id', entityId)
    .in('account_code', codes)
  return Object.fromEntries((data || []).map(a => [a.account_code, a]))
}

/** Check if a journal entry already exists for this source to prevent double-posting */
async function jeExistsForSource(entityId, sourceType, sourceId) {
  const { data } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('entity_id', entityId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .limit(1)
  return data && data.length > 0
}

/**
 * Core journal posting function.
 * lines: [{ accountCode, debit, credit, description }]
 * Returns { jeId } or { error }
 */
async function postEntry({ entityId, date, sourceType, sourceId, narration, reference, lines }) {
  // Idempotency guard — never double-post the same transaction
  const exists = await jeExistsForSource(entityId, sourceType, sourceId)
  if (exists) return { jeId: null, skipped: true }

  // Validate: debits must equal credits
  const totalDr = lines.reduce((s, l) => s + (+l.debit  || 0), 0)
  const totalCr = lines.reduce((s, l) => s + (+l.credit || 0), 0)
  if (Math.abs(totalDr - totalCr) > 0.01) {
    return { error: `Journal entry unbalanced: DR ${totalDr.toFixed(2)} ≠ CR ${totalCr.toFixed(2)}` }
  }

  const period  = date.slice(0, 7)                   // YYYY-MM
  const codes   = [...new Set(lines.map(l => l.accountCode))]
  const accMap  = await resolveAccounts(entityId, codes)
  const entryNo = await nextEntryNumber(entityId)

  // Insert header
  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      entity_id:   entityId,
      entry_number: entryNo,
      entry_date:  date,
      period,
      narration,
      reference,
      source_type: sourceType,
      source_id:   sourceId,
      status:      'POSTED',
      posted_at:   new Date().toISOString(),
    })
    .select('id')
    .single()

  if (jeErr) return { error: jeErr.message }

  // Insert lines
  const linePayloads = lines.map(l => {
    const acc = accMap[l.accountCode] || {}
    return {
      journal_entry_id: je.id,
      account_id:       acc.id   || null,
      account_code:     l.accountCode,
      account_name:     acc.account_name || l.accountCode,
      debit_amount:     +l.debit  || 0,
      credit_amount:    +l.credit || 0,
      description:      l.description || narration,
    }
  })

  const { error: lineErr } = await supabase
    .from('journal_entry_lines')
    .insert(linePayloads)

  if (lineErr) {
    // Roll back header if lines fail
    await supabase.from('journal_entries').delete().eq('id', je.id)
    return { error: lineErr.message }
  }

  return { jeId: je.id }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC AUTO-POSTING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// ─── COA Account Code Map (9-digit) ──────────────────────────────────────────
// Replace these with Mr. Hamdy's actual account codes when available.
// Structure: X-YY-ZZ-XXXX  (1+2+2+4 = 9 digits)
// 26001 maps to 260010001 (Other Payables — Liability category 60, sub 01)
export const COA = {
  // Assets
  PETTY_CASH:             '110010001',
  BANK_ANB15:             '110020001',  // Main operating
  BANK_ANB18:             '110020002',  // Main secondary
  BANK_ANB39:             '110020003',  // Field petty cash 1
  BANK_ANB77:             '110020004',  // Field petty cash 2
  AR_TRADE:               '120010001',  // Accounts Receivable — Trade
  AR_RETENTION:           '120010002',  // Retention Receivable
  VAT_RECOVERABLE:        '120010003',  // Input VAT
  EMPLOYEE_ADVANCE:       '130010001',  // Employee Advances Receivable ← Phase B
  SUPPLIER_ADVANCE:       '130010002',
  // Liabilities
  AP_TRADE:               '210010001',
  AP_SUBCON:              '210010002',
  SALARIES_PAYABLE:       '210030001',
  VAT_PAYABLE:            '220010001',  // Output VAT ← 26001-adjacent
  GOSI_EMPLOYER:          '220010002',
  GOSI_EMPLOYEE:          '220010003',
  OTHER_PAYABLES:         '260010001',  // ← 26001 is here
  ADVANCE_FROM_CLIENT:    '260010002',
  // Equity
  SHARE_CAPITAL:          '310010001',
  RETAINED_EARNINGS:      '320010001',
  // Revenue
  REVENUE_PROJECT:        '410010001',  // Default project revenue
  REVENUE_TOWER:          '410010001',
  REVENUE_ACTIVE:         '410010002',
  REVENUE_CIVIL:          '410010003',
  REVENUE_FIBRE:          '410010004',
  REVENUE_MAINTENANCE:    '410010005',
  RETENTION_RELEASED:     '420010001',
  // Direct Costs / COGS
  DIRECT_LABOUR:          '510010001',
  OUTSOURCED_LABOUR:      '510010002',
  SUBCONTRACTOR_COST:     '510020001',
  MATERIALS:              '510030001',
  FIELD_EXPENSES:         '510040001',  // ← used by postAdvanceJE settlement
  // Operating Expenses
  SALARIES:               '610010001',
  HOUSING_ALLOWANCE:      '610010002',
  TRANSPORT_ALLOWANCE:    '610010003',
  FOOD_ALLOWANCE:         '610010004',
  OVERTIME:               '610010005',
  GOSI_EXP:               '610020001',
  VISA_COSTS:             '610020003',
  RENT:                   '620010001',
  UTILITIES:              '620010002',
  OFFICE_SUPPLIES:        '630010001',
  TELECOM:                '630020001',
  PROFESSIONAL_FEES:      '630030001',
  TRAVEL:                 '630040001',
  GOVT_FEES:              '630050001',
  INSURANCE:              '630060001',
  BANK_CHARGES:           '640010001',
  DEPRECIATION:           '650010001',
  MISC:                   '660010001',
}

// Default bank account code (petty cash) — used when no specific bank is given
const DEFAULT_BANK = COA.PETTY_CASH

/**
 * postInvoiceJE — Called when an invoice is issued (status → ISSUED)
 *
 * Dr  120010001  Accounts Receivable        net_payable
 * Dr  120010002  Retention Receivable       retention_amount  (if any)
 * Cr  410010001  Project Revenue            subtotal
 * Cr  220010001  VAT Payable (Output VAT)   vat_amount
 */
export async function postInvoiceJE({ entityId, invoice, contractorName }) {
  const net = +invoice.net_payable     || 0
  const sub = +invoice.subtotal        || 0
  const vat = +invoice.vat_amount      || 0
  const ret = +invoice.retention_amount|| 0

  return postEntry({
    entityId,
    date:       invoice.invoice_date,
    sourceType: 'INVOICE',
    sourceId:   invoice.id,
    narration:  `Invoice ${invoice.invoice_number} — ${contractorName || 'Customer'}`,
    reference:  invoice.invoice_number,
    lines: [
      { accountCode: COA.AR_TRADE,    debit: net, description: `AR — ${invoice.invoice_number}` },
      ...(ret > 0 ? [{ accountCode: COA.AR_RETENTION, debit: ret, description: `Retention receivable — ${invoice.invoice_number}` }] : []),
      { accountCode: COA.REVENUE_PROJECT, credit: sub, description: 'Project Revenue' },
      { accountCode: COA.VAT_PAYABLE,     credit: vat, description: 'Output VAT 15%' },
    ],
  })
}

/**
 * postReceiptJE — Called when a Payment Receipt is saved
 *
 * Dr  [bank]  Bank Account              net_received
 * Dr  6410    Bank Charges              discounting_charge  (if > 0)
 * Cr  1200    Accounts Receivable       gross_amount
 *
 * bankAccountCode: COA code for the bank account used (e.g. '1110', '1120', '1130')
 * Defaults to '1110' if not provided.
 */
export async function postReceiptJE({ entityId, receipt, bankAccountCode = COA.BANK_ANB15 }) {
  const gross   = +receipt.gross_amount       || 0
  const net     = +receipt.net_received       || 0
  const charge  = +receipt.discounting_charge || 0

  const lines = [
    { accountCode: bankAccountCode,  debit: net,    description: `Cash in — ${receipt.receipt_number}` },
    ...(charge > 0 ? [{ accountCode: COA.BANK_CHARGES, debit: charge, description: 'Bank discounting / SCF charge' }] : []),
    { accountCode: COA.AR_TRADE,     credit: gross, description: `AR cleared — ${receipt.receipt_number}` },
  ]

  return postEntry({
    entityId,
    date:       receipt.receipt_date,
    sourceType: 'PAYMENT_RECEIPT',
    sourceId:   receipt.id,
    narration:  `Receipt ${receipt.receipt_number} — ${receipt.customer_name || ''}`,
    reference:  receipt.receipt_number,
    lines,
  })
}

/**
 * postPaymentOutJE — Called when a Money Request is marked PAID
 *
 * Dr  [expenseCode]  Expense account     amount
 * Cr  [bankCode]     Bank account        amount
 *
 * expenseAccountCode: defaults to '6300' (Admin Expenses) if category not mapped
 * bankAccountCode:    defaults to '1110'
 */

// Maps money-request categories to 9-digit COA expense codes
const EXPENSE_CODE_MAP = {
  SALARY:          COA.SALARIES,
  PAYROLL:         COA.SALARIES,
  SALARIES:        COA.SALARIES,
  GOSI:            COA.GOSI_EXP,
  RENT:            COA.RENT,
  UTILITIES:       COA.UTILITIES,
  OFFICE_SUPPLIES: COA.OFFICE_SUPPLIES,
  COMMUNICATION:   COA.TELECOM,
  TELECOM:         COA.TELECOM,
  PROFESSIONAL:    COA.PROFESSIONAL_FEES,
  AUDIT:           COA.PROFESSIONAL_FEES,
  LEGAL:           COA.PROFESSIONAL_FEES,
  TRAVEL:          COA.TRAVEL,
  VISA:            COA.VISA_COSTS,
  GOVERNMENT:      COA.GOVT_FEES,
  INSURANCE:       COA.INSURANCE,
  BANK_CHARGES:    COA.BANK_CHARGES,
  SUBCONTRACTOR:   COA.SUBCONTRACTOR_COST,
  MATERIALS:       COA.MATERIALS,
  DEPRECIATION:    COA.DEPRECIATION,
  PETTY_CASH:      COA.PETTY_CASH,
  MISC:            COA.MISC,
}

export async function postPaymentOutJE({
  entityId,
  moneyRequestId,
  date,
  amount,
  narration,
  reference,
  category = '',
  bankAccountCode = COA.BANK_ANB15,
}) {
  const upperCat    = (category || '').toUpperCase().replace(/\s+/g, '_')
  const expenseCode = EXPENSE_CODE_MAP[upperCat] || COA.MISC

  return postEntry({
    entityId,
    date,
    sourceType: 'PAYMENT_OUT',
    sourceId:   moneyRequestId,
    narration,
    reference,
    lines: [
      { accountCode: expenseCode,     debit:  amount, description: narration },
      { accountCode: bankAccountCode, credit: amount, description: 'Paid from bank' },
    ],
  })
}

/**
 * postVATPaymentJE — Called when a VAT payment to ZATCA is recorded
 *
 * Dr  2210  VAT Payable     amount_paid
 * Cr  [bank]  Bank Account  amount_paid
 */
export async function postVATPaymentJE({ entityId, vatPaymentId, date, amountPaid, reference, bankAccountCode = COA.BANK_ANB15 }) {
  return postEntry({
    entityId,
    date,
    sourceType: 'VAT_PAYMENT',
    sourceId:   vatPaymentId,
    narration:  `VAT Payment to ZATCA — ${reference || date}`,
    reference,
    lines: [
      { accountCode: COA.VAT_PAYABLE,  debit:  amountPaid, description: 'VAT Payable cleared' },
      { accountCode: bankAccountCode,  credit: amountPaid, description: 'Paid from bank' },
    ],
  })
}

/**
 * findJEForSource — Find a POSTED journal entry by source (invoice ID, receipt ID, etc.)
 * Returns the JE object or null.
 */
export async function findJEForSource(entityId, sourceType, sourceId) {
  const { data } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('entity_id', entityId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .eq('status', 'POSTED')
    .limit(1)
  return data?.[0] || null
}

/**
 * reverseJE — Reverses an existing journal entry (creates equal and opposite entry)
 * Used for voided invoices or corrected receipts.
 * Safe to call multiple times — checks if already reversed.
 */
export async function reverseJE({ entityId, originalJEId, date, narration }) {
  // Fetch original entry and its lines
  const { data: orig } = await supabase
    .from('journal_entries').select('*').eq('id', originalJEId).single()
  if (!orig) return { error: 'Original entry not found' }
  if (orig.status === 'REVERSED') return { skipped: true, message: 'Already reversed' }

  const { data: lines } = await supabase
    .from('journal_entry_lines').select('*').eq('journal_entry_id', originalJEId)
  if (!lines || lines.length === 0) return { error: 'No lines found on original entry' }

  const period  = date.slice(0, 7)
  const entryNo = await nextEntryNumber(entityId)

  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      entity_id:    entityId,
      entry_number: entryNo,
      entry_date:   date,
      period,
      narration:    narration || `Reversal of ${orig.entry_number}`,
      reference:    `REV-${orig.entry_number}`,
      source_type:  `${orig.source_type}_REVERSAL`,
      source_id:    orig.source_id,
      status:       'POSTED',
      posted_at:    new Date().toISOString(),
    })
    .select('id').single()

  if (jeErr) return { error: jeErr.message }

  // Swap Dr/Cr on all lines
  const revLines = lines.map(l => ({
    journal_entry_id: je.id,
    account_id:       l.account_id,
    account_code:     l.account_code,
    account_name:     l.account_name,
    debit_amount:     +l.credit_amount || 0,   // swap
    credit_amount:    +l.debit_amount  || 0,   // swap
    description:      `Reversal: ${l.description || ''}`,
  }))

  const { error: lineErr } = await supabase.from('journal_entry_lines').insert(revLines)
  if (lineErr) {
    await supabase.from('journal_entries').delete().eq('id', je.id)
    return { error: lineErr.message }
  }

  // Mark original as REVERSED
  await supabase.from('journal_entries')
    .update({ status: 'REVERSED' })
    .eq('id', originalJEId)

  return { jeId: je.id }
}

/**
 * voidInvoiceJE — Find and reverse the journal entry for a voided/cancelled invoice
 */
export async function voidInvoiceJE({ entityId, invoiceId, invoiceNumber, date }) {
  const orig = await findJEForSource(entityId, 'INVOICE', invoiceId)
  if (!orig) return { skipped: true, message: 'No posted JE found for this invoice' }
  return reverseJE({
    entityId,
    originalJEId: orig.id,
    date: date || new Date().toISOString().split('T')[0],
    narration: `Void reversal — ${invoiceNumber}`,
  })
}

/**
 * postCreditNoteJE — Called when a Credit Note is issued
 * Reverses revenue and AR: opposite of a normal invoice
 *
 * Dr  4110  Project Revenue         subtotal   (reduces revenue)
 * Dr  2210  VAT Payable             vat_amount (reduces VAT liability)
 * Cr  1200  Accounts Receivable     net_payable (reduces what customer owes)
 */
/**
 * postRetentionReleaseJE — Called when a retention release invoice is issued
 * Moves retention from Retention Receivable → AR (now collectable)
 *
 * Dr  1200  Accounts Receivable      releaseAmount
 * Cr  1290  Retention Receivable     releaseAmount
 */
export async function postRetentionReleaseJE({ entityId, invoice, contractorName }) {
  const net = +invoice.net_payable || 0

  return postEntry({
    entityId,
    date:       invoice.invoice_date,
    sourceType: 'INVOICE',
    sourceId:   invoice.id,
    narration:  `Retention Release ${invoice.invoice_number} — ${contractorName || 'Customer'}`,
    reference:  invoice.invoice_number,
    lines: [
      { accountCode: COA.AR_TRADE,     debit:  net, description: `AR — retention release ${invoice.invoice_number}` },
      { accountCode: COA.AR_RETENTION, credit: net, description: 'Retention receivable released' },
    ],
  })
}

/**
 * postAdvanceJE — DH issues cash advance to an employee
 *
 * Dr  1310  Employee Advances Receivable    amount
 * Cr  [bank] Petty Cash / Field Account     amount
 *
 * bankAccountCode: COA code of the source bank account (e.g. '1140' petty cash)
 */
export async function postAdvanceJE({
  entityId, advanceId, date, amount, employeeName, bankAccountCode = COA.PETTY_CASH,
}) {
  return postEntry({
    entityId,
    date,
    sourceType: 'EMPLOYEE_ADVANCE',
    sourceId:   advanceId,
    narration:  `Field advance — ${employeeName}`,
    reference:  `ADV-${advanceId.slice(0, 8).toUpperCase()}`,
    lines: [
      { accountCode: COA.EMPLOYEE_ADVANCE, debit:  amount, description: `Advance receivable — ${employeeName}` },
      { accountCode: bankAccountCode,      credit: amount, description: 'Petty cash / field account' },
    ],
  })
}

/**
 * postClaimSettlementJE — Expense claim approved by Finance
 * Clears the employee advance and books the project expense(s)
 *
 * For each expense line:
 *   Dr  [expenseCode]  Project Expense      line.amount
 * Total:
 *   Cr  1310           Employee Advance     total_claimed
 *
 * If advance > claimed (employee keeps surplus):
 *   Dr  1310  Employee Advance              surplus  (reduces their balance)
 *   Cr  1310  Employee Advance              surplus  (net: the surplus stays on 1310)
 *   — Actually we just settle the claimed portion; remaining stays on 1310 naturally.
 *
 * Simple form: single line version (detailed per-category is Phase C)
 * Dr  5300  Field / Project Expenses        total_claimed
 * Cr  1310  Employee Advances Receivable    total_claimed
 */
export async function postClaimSettlementJE({
  entityId, claimId, claimNumber, date, totalClaimed, employeeName, projectCode = '',
}) {
  return postEntry({
    entityId,
    date,
    sourceType: 'EXPENSE_CLAIM',
    sourceId:   claimId,
    narration:  `Expense claim settlement — ${employeeName} (${claimNumber})`,
    reference:  claimNumber,
    lines: [
      { accountCode: COA.FIELD_EXPENSES,   debit:  totalClaimed, description: `Field expenses — ${employeeName} ${projectCode}` },
      { accountCode: COA.EMPLOYEE_ADVANCE, credit: totalClaimed, description: `Advance cleared — ${claimNumber}` },
    ],
  })
}

export async function postCreditNoteJE({ entityId, invoice, contractorName }) {
  const net = +invoice.net_payable || 0
  const sub = +invoice.subtotal    || 0
  const vat = +invoice.vat_amount  || 0

  return postEntry({
    entityId,
    date:       invoice.invoice_date,
    sourceType: 'INVOICE',
    sourceId:   invoice.id,
    narration:  `Credit Note ${invoice.invoice_number} — ${contractorName || 'Customer'}`,
    reference:  invoice.invoice_number,
    lines: [
      { accountCode: COA.REVENUE_PROJECT, debit:  sub, description: 'Revenue reduction — credit note' },
      { accountCode: COA.VAT_PAYABLE,     debit:  vat, description: 'Output VAT reduction' },
      { accountCode: COA.AR_TRADE,        credit: net, description: `AR reduced — ${invoice.invoice_number}` },
    ],
  })
}
