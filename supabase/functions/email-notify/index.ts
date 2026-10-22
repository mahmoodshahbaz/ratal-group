/**
 * email-notify — Supabase Edge Function
 *
 * Sends branded emails WITH a PDF attachment for 8 key business events.
 * Called directly from the frontend after successful data saves.
 *
 * ── Event types handled ───────────────────────────────────────────────
 *   NEW_VEHICLE      MONEY_REQUEST     PAYMENT
 *   INCOMING_PO      OUTGOING_PO       NEW_PROJECT
 *   SITE_ASSIGNMENT  SUBCON_CLAIM
 *
 * ── Request body (JSON) ───────────────────────────────────────────────
 *   type    : string          — one of the 8 types above
 *   data    : object          — event-specific fields (see below)
 *   to      : string[]        — recipient email(s) (department head / PM)
 *   cc      : string[]        — optional extra CC (mahmood@accsyscom.com added automatically)
 *
 * ── Deploy ────────────────────────────────────────────────────────────
 *   npx supabase functions deploy email-notify
 *
 * ── Secrets ───────────────────────────────────────────────────────────
 *   RESEND_API_KEY   = re_xxxxxxxxxxxx      (from resend.com)
 *   RESEND_FROM      = ACCSYS <notify@accsyscom.com>
 *   ACCSYS_CC_EMAILS = mahmood@accsyscom.com,rashad@accsyscom.com
 *   SUPABASE_URL    = <auto-set>
 *   SUPABASE_SERVICE_ROLE_KEY = <auto-set>
 */

import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const RESEND_API = 'https://api.resend.com/emails'

// ── Colours ────────────────────────────────────────────────────────────
const NAVY   = rgb(0.102, 0.145, 0.251)   // #1a2540
const TEAL   = rgb(0.016, 0.604, 0.620)   // #04999e ≈ brand teal
const WHITE  = rgb(1, 1, 1)
const DGREY  = rgb(0.22, 0.28, 0.31)
const LGREY  = rgb(0.94, 0.96, 0.97)
const BLACK  = rgb(0, 0, 0)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── PDF builder ────────────────────────────────────────────────────────

async function buildPdf(type: string, data: Record<string, string>): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([595, 842])   // A4

  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  const { width, height } = page.getSize()
  const margin = 48

  // ── Header bar ──────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 72, width, height: 72, color: NAVY })
  page.drawText('ACCSYS', { x: margin, y: height - 44, size: 22, font: bold, color: WHITE })
  page.drawText('Ratal Group · Field Operations Platform', { x: margin, y: height - 60, size: 9, font: reg, color: rgb(0.7, 0.75, 0.82) })

  // ── Thin accent bar ──────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 76, width, height: 4, color: TEAL })

  // ── Document type label ──────────────────────────────────────────────
  const TYPE_LABELS: Record<string, string> = {
    NEW_VEHICLE:     'New Vehicle Registration',
    MONEY_REQUEST:   'Money Request',
    PAYMENT:         'Payment Record',
    INCOMING_PO:     'Incoming Purchase Order',
    OUTGOING_PO:     'Outgoing Purchase Order',
    NEW_PROJECT:     'New Project',
    SITE_ASSIGNMENT: 'Site Assignment',
    SUBCON_CLAIM:    'Sub-Contractor Claim',
  }
  const typeLabel = TYPE_LABELS[type] || type

  let y = height - 110

  page.drawText(typeLabel.toUpperCase(), { x: margin, y, size: 9, font: bold, color: TEAL })
  y -= 24
  page.drawText(data['title'] || typeLabel, { x: margin, y, size: 18, font: bold, color: NAVY })
  y -= 20

  // Reference + date row
  const ref  = data['reference'] || data['number'] || '—'
  const date = data['date'] || new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
  page.drawText(`Ref: ${ref}`, { x: margin, y, size: 10, font: reg, color: DGREY })
  page.drawText(`Date: ${date}`, { x: width - margin - 120, y, size: 10, font: reg, color: DGREY })
  y -= 24

  // Divider
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.85, 0.88, 0.91) })
  y -= 20

  // ── Fields table ─────────────────────────────────────────────────────
  const SKIP = ['title', 'reference', 'number', 'date']  // already shown above
  const entries = Object.entries(data).filter(([k]) => !SKIP.includes(k) && data[k])

  const rowH  = 26
  const labelW = 170
  let rowIdx  = 0

  for (const [key, value] of entries) {
    if (y - rowH < 100) break   // stop before footer
    const isEven = rowIdx % 2 === 0
    if (isEven) {
      page.drawRectangle({ x: margin - 6, y: y - rowH + 6, width: width - 2 * margin + 12, height: rowH, color: LGREY })
    }

    const label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())

    page.drawText(label, { x: margin + 4, y: y - 6, size: 9, font: bold, color: DGREY })
    page.drawText(String(value).slice(0, 80), { x: margin + labelW, y: y - 6, size: 9, font: reg, color: BLACK })
    y -= rowH
    rowIdx++
  }

  // ── Footer ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: 44, color: rgb(0.95, 0.97, 0.98) })
  page.drawLine({ start: { x: 0, y: 44 }, end: { x: width, y: 44 }, thickness: 0.5, color: rgb(0.82, 0.86, 0.90) })
  page.drawText(
    `This document was generated automatically by ACCSYS on ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}. Confidential — Ratal Group internal use only.`,
    { x: margin, y: 16, size: 7, font: reg, color: rgb(0.55, 0.60, 0.65), maxWidth: width - 2 * margin }
  )

  return await doc.save()
}

// ── HTML email body ───────────────────────────────────────────────────

function buildEmailHtml(type: string, data: Record<string, string>, recipientName: string): string {
  const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
    NEW_VEHICLE:     { icon:'🚗', color:'#4e342e', label:'New Vehicle Registered'      },
    MONEY_REQUEST:   { icon:'💰', color:'#e65100', label:'Money Request Submitted'      },
    PAYMENT:         { icon:'💳', color:'#1565c0', label:'Payment Recorded'            },
    INCOMING_PO:     { icon:'📥', color:'#1b5e20', label:'Incoming Purchase Order'     },
    OUTGOING_PO:     { icon:'📤', color:'#4a148c', label:'Outgoing Purchase Order'     },
    NEW_PROJECT:     { icon:'🏗️', color:'#006064', label:'New Project Created'         },
    SITE_ASSIGNMENT: { icon:'📍', color:'#1565c0', label:'Site Assignment Made'        },
    SUBCON_CLAIM:    { icon:'🔨', color:'#00695c', label:'Sub-Contractor Claim'        },
  }
  const tm = TYPE_META[type] || { icon:'📄', color:'#37474f', label: type }

  const SKIP = ['title']
  const rows = Object.entries(data)
    .filter(([k, v]) => !SKIP.includes(k) && v)
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      return `<tr>
        <td style="padding:8px 12px;font-size:12px;font-weight:700;color:#6b7c93;width:170px;background:#f8f9fa;border-bottom:1px solid #e8edf3">${label}</td>
        <td style="padding:8px 12px;font-size:13px;color:#1a2540;border-bottom:1px solid #e8edf3">${String(v)}</td>
      </tr>`
    }).join('\n')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:32px auto">
    <tr><td style="background:#1a2540;padding:22px 28px;border-radius:14px 14px 0 0">
      <span style="font-size:20px;font-weight:900;color:#fff">⚡ ACCSYS</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.55);margin-left:10px">Ratal Group · Field Operations</span>
    </td></tr>
    <tr><td style="background:${tm.color};padding:4px"></td></tr>
    <tr><td style="background:#fff;padding:28px;border-left:1px solid #e8edf3;border-right:1px solid #e8edf3">
      <div style="font-size:28px;margin-bottom:6px">${tm.icon}</div>
      <div style="font-size:10px;font-weight:700;color:${tm.color};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${tm.label}</div>
      <h2 style="margin:0 0 20px;font-size:18px;color:#1a2540;font-weight:800">${data['title'] || tm.label}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8edf3;border-radius:10px;overflow:hidden;margin-bottom:20px">
        ${rows}
      </table>
      <p style="margin:0 0 6px;font-size:12px;color:#6b7c93">📎 A PDF copy of this document is attached for your records.</p>
      <p style="margin:0;font-size:12px;color:#6b7c93">Hi ${recipientName}, this notification was generated by ACCSYS. Please do not reply to this email.</p>
    </td></tr>
    <tr><td style="background:#f0f4f8;padding:14px 28px;border-radius:0 0 14px 14px;border:1px solid #e8edf3;border-top:none;text-align:center">
      <span style="font-size:10px;color:#6b7c93">© ${new Date().getFullYear()} Ratal Group · Confidential</span>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Subject line per type ─────────────────────────────────────────────

function emailSubject(type: string, data: Record<string, string>): string {
  const ref = data['reference'] || data['number'] || ''
  const SUBJECTS: Record<string, string> = {
    NEW_VEHICLE:     `[ACCSYS] New Vehicle Registered${ref ? ` · ${ref}` : ''}`,
    MONEY_REQUEST:   `[ACCSYS] Money Request${ref ? ` · ${ref}` : ''} — Action Required`,
    PAYMENT:         `[ACCSYS] Payment Recorded${ref ? ` · ${ref}` : ''}`,
    INCOMING_PO:     `[ACCSYS] Incoming PO${ref ? ` · ${ref}` : ''}`,
    OUTGOING_PO:     `[ACCSYS] Outgoing PO${ref ? ` · ${ref}` : ''}`,
    NEW_PROJECT:     `[ACCSYS] New Project${ref ? ` · ${ref}` : ''}`,
    SITE_ASSIGNMENT: `[ACCSYS] Site Assignment${ref ? ` · ${ref}` : ''}`,
    SUBCON_CLAIM:    `[ACCSYS] Sub-Con Claim${ref ? ` · ${ref}` : ''} — Review Required`,
  }
  return SUBJECTS[type] || `[ACCSYS] ${type}${ref ? ` · ${ref}` : ''}`
}

// ── Main handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { type, data, to, cc = [] } = await req.json() as {
      type: string
      data: Record<string, string>
      to:   string[]
      cc?:  string[]
    }

    if (!type || !data || !to?.length) {
      return errResponse('type, data, and to[] are required')
    }

    const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')   || ''
    const RESEND_FROM  = Deno.env.get('RESEND_FROM')      || 'ACCSYS <notify@accsyscom.com>'
    // ACCSYS_CC_EMAILS: comma-separated list of permanent CC addresses
    // e.g. "mahmood@accsyscom.com,rashad@accsyscom.com"
    const AUTO_CC_RAW  = Deno.env.get('ACCSYS_CC_EMAILS') || 'mahmood@accsyscom.com,rashad@accsyscom.com'
    const AUTO_CC      = AUTO_CC_RAW.split(',').map(e => e.trim()).filter(Boolean)

    if (!RESEND_KEY) return errResponse('RESEND_API_KEY not configured')

    // Generate PDF
    const pdfBytes  = await buildPdf(type, data)
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes))
    const fileName  = `ACCSYS_${type}_${(data['reference'] || data['number'] || Date.now()).toString().replace(/\W/g,'_')}.pdf`

    // Build email
    const html        = buildEmailHtml(type, data, 'Team')
    const subject     = emailSubject(type, data)
    const ccList      = Array.from(new Set([...cc, ...AUTO_CC]))

    const resendBody = {
      from:        RESEND_FROM,
      to,
      cc:          ccList,
      subject,
      html,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }

    const res  = await fetch(RESEND_API, {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(resendBody),
    })
    const result = await res.json()

    if (!res.ok) {
      console.error('Resend error:', result)
      return errResponse(`Resend error: ${JSON.stringify(result)}`)
    }

    return new Response(JSON.stringify({ success: true, id: result.id, to, cc: ccList, pdf: fileName }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('email-notify error:', err)
    return errResponse(String(err))
  }
})

function errResponse(msg: string) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status: 400,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
