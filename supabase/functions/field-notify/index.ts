/**
 * field-notify — Supabase Edge Function
 *
 * Triggered by a database webhook on INSERT to the `notifications` table.
 * Sends Telegram messages for HIGH-FREQUENCY operational events.
 *
 * For the 8 occasional business events (New Vehicle, PO, Project, etc.)
 * see the separate `email-notify` edge function.
 *
 * ── Deploy ────────────────────────────────────────────────────────────
 *   npx supabase functions deploy field-notify
 *
 * ── Secrets ───────────────────────────────────────────────────────────
 *   TELEGRAM_BOT_TOKEN        = <your bot token>
 *   SUPABASE_URL              = <auto-set by Supabase>
 *   SUPABASE_SERVICE_ROLE_KEY = <auto-set by Supabase>
 *
 * ── Database Webhook ──────────────────────────────────────────────────
 *   Table:  notifications
 *   Events: INSERT
 *   URL:    https://<ref>.supabase.co/functions/v1/field-notify
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_API = 'https://api.telegram.org/bot'

interface NotificationRecord {
  id:          string
  entity_id:   string | null
  employee_id: string
  type:        string
  title:       string
  body:        string | null
  metadata:    Record<string, unknown> | null
  created_at:  string
}

interface WebhookPayload {
  type:   'INSERT' | 'UPDATE' | 'DELETE'
  table:  string
  record: NotificationRecord
  schema: string
}

function buildMessage(n: NotificationRecord): string {
  const meta   = n.metadata || {}
  const body   = n.body || ''
  const amount = meta.amount ? `SAR ${Number(meta.amount).toLocaleString()}` : ''
  const site   = meta.site_number as string || ''
  const pct    = meta.pct ? `${meta.pct}%` : ''
  const lines: string[] = []

  switch (n.type) {
    case 'ADVANCE_ISSUED':
      lines.push(`💸 *Cash Advance Received*`, ``)
      if (amount) lines.push(`Amount: *${amount}*`)
      if (body)   lines.push(body)
      lines.push(``, `_Please acknowledge receipt and keep the signed voucher._`)
      break
    case 'ADVANCE_RETURN':
      lines.push(`🔄 *Advance Return Confirmed*`, ``)
      if (amount) lines.push(`Returned: *${amount}*`)
      if (body)   lines.push(body)
      break
    case 'CLAIM_SUBMITTED':
      lines.push(`🧾 *Expense Claim — Action Required*`, ``)
      lines.push(`*${n.title}*`)
      if (body)   lines.push(body)
      if (amount) lines.push(`Total: *${amount}*`)
      lines.push(``, `Open the DH Command Centre to approve.`)
      break
    case 'APPROVAL':
      lines.push(`✅ *${n.title}*`, ``)
      if (body) lines.push(body)
      break
    case 'SITE_STATUS':
      lines.push(`📍 *Site Update*`, ``)
      if (site) lines.push(`Site: *${site}*`)
      if (pct)  lines.push(`Progress: *${pct}*`)
      lines.push(`*${n.title}*`)
      if (body) lines.push(body)
      break
    case 'PAYMENT_CONFIRMED':
      lines.push(`✅ *Advance Receipt Confirmed*`, ``)
      lines.push(`*${n.title}*`)
      if (body)   lines.push(body)
      if (amount) lines.push(`Amount: *${amount}*`)
      lines.push(``, `_Employee has uploaded a signed voucher._`)
      break
    case 'CAR_INCIDENT':
      lines.push(`🚨 *Vehicle Incident Reported*`, ``)
      lines.push(`*${n.title}*`)
      if (body) lines.push(body)
      const plate = meta.plate_number as string || ''
      if (plate) lines.push(`Vehicle: *${plate}*`)
      lines.push(``, `_Review in the Fleet tab of Command Centre._`)
      break
    case 'CAR_URGENT':
      lines.push(`⚠️ *Urgent Maintenance Required*`, ``)
      lines.push(`*${n.title}*`)
      if (body) lines.push(body)
      const urgency = meta.urgency as string || ''
      if (urgency) lines.push(`Urgency: *${urgency}*`)
      lines.push(``, `_Action required — check Fleet Management._`)
      break
    // ── Gap N5: new notification types ─────────────────────────────────────
    case 'SALARY_CREDITED':
      lines.push(`🏦 *Salary Credited*`, ``)
      if (amount) lines.push(`Amount: *${amount}*`)
      if (body)   lines.push(body)
      lines.push(``, `_Check your bank account. Contact HR if you have any queries._`)
      break
    case 'PENALTY_RECORDED':
      lines.push(`🚫 *Traffic / Fleet Penalty Recorded*`, ``)
      lines.push(`*${n.title}*`)
      if (body)   lines.push(body)
      if (amount) lines.push(`Penalty Amount: *${amount}*`)
      lines.push(``, `_This penalty has been recorded against your profile. Contact HR for details._`)
      break
    case 'LEAVE_APPROVED':
      lines.push(`🌴 *Leave Request Approved*`, ``)
      lines.push(`*${n.title}*`)
      if (body) lines.push(body)
      lines.push(``, `_Your leave has been approved. Enjoy!_`)
      break
    case 'LEAVE_REJECTED':
      lines.push(`🚷 *Leave Request Rejected*`, ``)
      lines.push(`*${n.title}*`)
      if (body) lines.push(body)
      lines.push(``, `_Contact your Department Head for more information._`)
      break
    case 'DOC_EXPIRY':
      lines.push(`📄 *Document Expiry Alert*`, ``)
      lines.push(`*${n.title}*`)
      if (body) lines.push(body)
      lines.push(``, `_Please renew your document before the expiry date to avoid any issues._`)
      break
    case 'DH_PAYMENT_ACK':
      lines.push(`🏷️ *Payment Acknowledgment Required*`, ``)
      lines.push(`*${n.title}*`)
      if (body)   lines.push(body)
      if (amount) lines.push(`Payment Amount: *${amount}*`)
      lines.push(``, `_Please open the DH Command Centre and acknowledge this payment within 15 days._`)
      break
    default:
      lines.push(`🔔 *${n.title}*`)
      if (body) lines.push(``, body)
  }
  return lines.join('\n')
}

Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json()

    if (payload.type !== 'INSERT' || payload.table !== 'notifications') {
      return ok({ skipped: true, reason: 'Not a notifications INSERT' })
    }

    const n = payload.record
    if (!n?.employee_id) {
      return ok({ skipped: true, reason: 'No employee_id on notification' })
    }

    const BOT_TOKEN   = Deno.env.get('TELEGRAM_BOT_TOKEN')        || ''
    const SUPA_URL    = Deno.env.get('SUPABASE_URL')              || ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!BOT_TOKEN) {
      return ok({ skipped: true, reason: 'TELEGRAM_BOT_TOKEN not set' })
    }

    const supabase = createClient(SUPA_URL, SERVICE_KEY)

    const { data: emp } = await supabase
      .from('employees')
      .select('full_name_en, telegram_chat_id')
      .eq('id', n.employee_id)
      .single()

    if (!emp?.telegram_chat_id) {
      return ok({ skipped: true, reason: `No telegram_chat_id for ${emp?.full_name_en || n.employee_id}` })
    }

    const text  = buildMessage(n)
    const tgRes = await fetch(`${TELEGRAM_API}${BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: emp.telegram_chat_id, text, parse_mode: 'Markdown' }),
    })
    const tgBody = await tgRes.json()

    if (tgRes.ok) {
      await supabase
        .from('notifications')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', n.id)
    }

    return ok({
      sent:      tgRes.ok,
      recipient: emp.full_name_en,
      type:      n.type,
      tg_ok:     tgBody.ok,
      tg_msg_id: tgBody.result?.message_id,
    })

  } catch (err) {
    console.error('field-notify error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
}
