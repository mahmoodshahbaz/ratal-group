/**
 * googleSheets.js — Fire-and-forget sync to Google Sheets via Apps Script Web App
 *
 * Setup (one-time):
 *  1. Open Google Sheets → Extensions → Apps Script
 *  2. Paste the Apps Script code from /docs/google_apps_script.gs
 *  3. Deploy → New Deployment → Web App
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  4. Copy the Web App URL
 *  5. Add to your .env file:
 *       VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
 *
 * Usage in any form:
 *   import { postToSheet } from '../lib/googleSheets'
 *   await Promise.all([
 *     supabase.from('expenses').insert(payload),
 *     postToSheet('expense', payload),           // ← add this
 *   ])
 *
 * IMPORTANT:
 *  - postToSheet NEVER throws — form submission always succeeds even if Sheets fails
 *  - Uses mode:'no-cors' so no CORS preflight, no response needed
 *  - If VITE_GOOGLE_SCRIPT_URL is not set, it silently skips (safe for dev)
 */

const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL || ''

/**
 * Sheet name map — matches the tabs in your Google Sheet
 * You can rename these to match your preferred tab names
 */
export const SHEET_NAMES = {
  expense:     'Expenses',
  food:        'Food Allowance',
  overtime:    'Overtime',
  po_request:  'PO Requests',
  site_status: 'Site Status',
}

/**
 * Post data to Google Sheets — fire and forget, never blocks form submission
 *
 * @param {string} formType  — key from SHEET_NAMES above
 * @param {object} data      — the payload being saved to Supabase (same object)
 */
export async function postToSheet(formType, data) {
  if (!SCRIPT_URL) return   // not configured — safe skip

  const payload = {
    formType,
    sheetName: SHEET_NAMES[formType] || formType,
    syncedAt:  new Date().toISOString(),
    ...data,
  }

  try {
    // mode: 'no-cors' avoids preflight — we don't need the response
    fetch(SCRIPT_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    })
    // Intentionally NOT awaited — truly fire-and-forget
    // Form submit resolves as soon as Supabase returns, Sheet syncs in background
  } catch {
    // Silently ignore — Sheets failure never breaks the form
  }
}

/**
 * Convenience: check if Google Sheets sync is configured
 */
export const isSheetsConfigured = () => Boolean(SCRIPT_URL)
