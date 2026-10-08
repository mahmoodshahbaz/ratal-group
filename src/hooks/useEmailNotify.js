/**
 * useEmailNotify.js
 * ACCSYS — Send branded emails with PDF attachments for 8 key business events.
 *
 * Usage:
 *   import { sendBusinessEmail } from '../hooks/useEmailNotify'
 *
 *   // After saving a new vehicle:
 *   await sendBusinessEmail('NEW_VEHICLE', {
 *     title:         'Toyota Hilux — ABC 1234',
 *     reference:     'VEH-2026-001',
 *     date:          '30 Aug 2026',
 *     plate_number:  'ABC 1234',
 *     make:          'Toyota',
 *     model:         'Hilux',
 *     color:         'White',
 *     fuel_type:     'Diesel',
 *     odometer:      '45,000 km',
 *     registered_by: 'Mahmood Shahbaz',
 *   }, ['fleet.manager@example.com'])
 *
 * ── Supported types ───────────────────────────────────────────────────
 *   NEW_VEHICLE     MONEY_REQUEST    PAYMENT
 *   INCOMING_PO     OUTGOING_PO      NEW_PROJECT
 *   SITE_ASSIGNMENT SUBCON_CLAIM
 *
 * ── Routing ───────────────────────────────────────────────────────────
 *   to  = array of recipient emails you pass in (relevant DH / PM / Finance)
 *   cc  = mahmood@accsyscom.com (auto-added by the edge function)
 */

import { supabase } from '../lib/supabase'

const FUNCTION_NAME = 'email-notify'

/**
 * Send a business event email with PDF attachment.
 *
 * @param {string}   type  — event type (see supported list above)
 * @param {object}   data  — flat key-value object for the PDF / email body
 * @param {string[]} to    — recipient email addresses (department head / PM)
 * @param {string[]} [cc]  — additional CC addresses (mahmood@accsyscom.com always added)
 * @returns {Promise<{success:boolean, id?:string, error?:string}>}
 */
export async function sendBusinessEmail(type, data, to, cc = []) {
  try {
    const { data: result, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: { type, data, to, cc },
    })

    if (error) throw new Error(error.message)
    return result

  } catch (err) {
    console.error('[useEmailNotify]', type, err)
    return { success: false, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers — one per event type
// Each wrapper enforces the correct data shape for that event.
// Call these directly from forms / admin pages after a successful save.
// ─────────────────────────────────────────────────────────────────────────────

/** New vehicle added to the fleet */
export async function emailNewVehicle({ plateNumber, make, model, year, color, fuelType, odometer, registeredBy, entityCode }, to) {
  return sendBusinessEmail('NEW_VEHICLE', {
    title:         `${make} ${model} · ${plateNumber}`,
    reference:     plateNumber,
    date:          today(),
    plate_number:  plateNumber,
    make,
    model,
    year:          year || '—',
    color:         color || '—',
    fuel_type:     fuelType || '—',
    odometer:      odometer ? `${Number(odometer).toLocaleString()} km` : '—',
    entity:        entityCode || '—',
    registered_by: registeredBy,
  }, to)
}

/** Money / advance request submitted */
export async function emailMoneyRequest({ requestNumber, requestedBy, department, amount, currency = 'SAR', purpose, requestDate, entityCode }, to) {
  return sendBusinessEmail('MONEY_REQUEST', {
    title:          `Money Request · ${requestNumber}`,
    reference:      requestNumber,
    date:           requestDate || today(),
    requested_by:   requestedBy,
    department:     department || '—',
    entity:         entityCode || '—',
    amount:         `${currency} ${Number(amount).toLocaleString()}`,
    purpose:        purpose || '—',
    status:         'Submitted — Awaiting Approval',
  }, to)
}

/** Payment recorded (outgoing or internal) */
export async function emailPayment({ paymentRef, paidTo, amount, currency = 'SAR', paymentMethod, paymentDate, authorisedBy, notes, entityCode }, to) {
  return sendBusinessEmail('PAYMENT', {
    title:          `Payment · ${paymentRef}`,
    reference:      paymentRef,
    date:           paymentDate || today(),
    paid_to:        paidTo,
    amount:         `${currency} ${Number(amount).toLocaleString()}`,
    payment_method: paymentMethod || '—',
    authorised_by:  authorisedBy || '—',
    entity:         entityCode || '—',
    notes:          notes || '—',
  }, to)
}

/** Incoming Purchase Order (supplier PO received) */
export async function emailIncomingPO({ poNumber, supplier, poDate, deliveryDate, totalAmount, currency = 'SAR', items, requestedBy, entityCode }, to) {
  return sendBusinessEmail('INCOMING_PO', {
    title:          `Incoming PO · ${poNumber}`,
    reference:      poNumber,
    date:           poDate || today(),
    supplier,
    expected_delivery: deliveryDate || '—',
    total_amount:   `${currency} ${Number(totalAmount).toLocaleString()}`,
    items_summary:  items || '—',
    requested_by:   requestedBy || '—',
    entity:         entityCode || '—',
  }, to)
}

/** Outgoing Purchase Order (issued to supplier) */
export async function emailOutgoingPO({ poNumber, issuedTo, poDate, validUntil, totalAmount, currency = 'SAR', scope, authorisedBy, entityCode }, to) {
  return sendBusinessEmail('OUTGOING_PO', {
    title:          `Outgoing PO · ${poNumber}`,
    reference:      poNumber,
    date:           poDate || today(),
    issued_to:      issuedTo,
    valid_until:    validUntil || '—',
    total_amount:   `${currency} ${Number(totalAmount).toLocaleString()}`,
    scope,
    authorised_by:  authorisedBy || '—',
    entity:         entityCode || '—',
  }, to)
}

/** New project created */
export async function emailNewProject({ projectNumber, projectName, client, contractValue, currency = 'SAR', startDate, pmName, entityCode }, to) {
  return sendBusinessEmail('NEW_PROJECT', {
    title:          `${projectName}`,
    reference:      projectNumber,
    date:           startDate || today(),
    project_number: projectNumber,
    client,
    contract_value: `${currency} ${Number(contractValue).toLocaleString()}`,
    start_date:     startDate || '—',
    project_manager: pmName || '—',
    entity:         entityCode || '—',
  }, to)
}

/** Employee assigned to a site */
export async function emailSiteAssignment({ siteNumber, siteName, scopeType, assignedTo, assignedFrom, assignedUntil, projectName, dhName, entityCode }, to) {
  return sendBusinessEmail('SITE_ASSIGNMENT', {
    title:          `Site Assignment · ${siteNumber}`,
    reference:      siteNumber,
    date:           today(),
    site_number:    siteNumber,
    site_name:      siteName || '—',
    scope:          (scopeType || '').replace(/_/g, ' '),
    assigned_to:    assignedTo,
    project:        projectName || '—',
    from_date:      assignedFrom || '—',
    to_date:        assignedUntil || '—',
    dept_head:      dhName || '—',
    entity:         entityCode || '—',
  }, to)
}

/** Sub-contractor claim submitted */
export async function emailSubConClaim({ claimNumber, contractorName, employeeName, siteName, scopeType, claimMonth, claimYear, claimType, claimAmount, vatAmount, totalAmount, currency = 'SAR', workDescription, entityCode }, to) {
  return sendBusinessEmail('SUBCON_CLAIM', {
    title:          `Sub-Con Claim · ${claimNumber}`,
    reference:      claimNumber,
    date:           today(),
    contractor:     contractorName || '—',
    submitted_by:   employeeName,
    site:           siteName || '—',
    scope:          (scopeType || '').replace(/_/g, ' '),
    period:         `${claimMonth}/${claimYear}`,
    claim_type:     (claimType || '').replace(/_/g, ' '),
    claim_amount:   `${currency} ${Number(claimAmount).toLocaleString()}`,
    vat_amount:     `${currency} ${Number(vatAmount || 0).toLocaleString()}`,
    total_amount:   `${currency} ${Number(totalAmount).toLocaleString()}`,
    work_done:      (workDescription || '—').slice(0, 120),
    entity:         entityCode || '—',
    status:         'Submitted — Awaiting DH Approval',
  }, to)
}

// ── Helper ────────────────────────────────────────────────────────────
function today() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
