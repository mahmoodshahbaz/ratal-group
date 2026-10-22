/**
 * SUPABASE EDGE FUNCTION — telegram-notify
 *
 * Triggered via database webhook or direct HTTP call.
 * Sends Telegram notifications to approvers when:
 *   — Money Request is created/updated
 *   — Purchase Order status changes
 *   — Expense submitted
 *   — OT/Food Allowance submitted
 *
 * Deploy:
 *   supabase functions deploy telegram-notify
 *
 * Secrets (set in Supabase Dashboard → Edge Functions → Secrets):
 *   TELEGRAM_BOT_TOKEN = 8760676844:AAGvfj-caDhfxHaD-Hyv_1jpPxz5NrPEu20
 *   SUPABASE_SERVICE_ROLE_KEY = (your service_role key)
 *
 * Database Webhook:
 *   Table: money_requests → INSERT/UPDATE → POST to this function
 *   Table: purchase_orders → INSERT/UPDATE → POST to this function
 *   Table: expenses → INSERT → POST to this function
 *   Table: overtime_submissions → INSERT → POST to this function
 *   Table: food_allowances → INSERT → POST to this function
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_API = 'https://api.telegram.org/bot'

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Record<string, unknown>
  old_record?: Record<string, unknown>
  schema: string
}

Deno.serve(async (req) => {
  // Allow direct HTTP calls with a JSON body too
  const body: WebhookPayload = await req.json()
  const { table, type, record } = body

  const BOT_TOKEN  = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not set' }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  let message = ''
  let chatIds: string[] = []

  // ─── MONEY REQUEST ──────────────────────────────────────────
  if (table === 'money_requests') {
    const mr = record
    const status = mr.status as string
    const reqNo  = mr.request_number as string || 'MR-???'
    const dept   = mr.department as string || ''
    const amount = (mr.amount as number || 0).toFixed(2)

    // Get requester name
    let requesterName = 'Unknown'
    if (mr.requested_by) {
      const { data: emp } = await supabase
        .from('employees')
        .select('full_name_en, telegram_chat_id')
        .eq('id', mr.requested_by)
        .single()
      requesterName = emp?.full_name_en || requesterName
    }

    if (status === 'PENDING' || status === 'DH_PENDING') {
      message = [
        `💰 *Money Request — Action Required*`,
        ``,
        `📋 Request: *${reqNo}*`,
        `👤 Requested by: ${requesterName}`,
        `🏢 Department: ${dept}`,
        `💵 Amount: SAR ${amount}`,
        ``,
        `⏳ Status: *Awaiting Your Approval*`,
        ``,
        `Please open Ratal Group ERP to approve or reject.`,
      ].join('\n')

      // Notify department heads / admins
      const { data: deptHeads } = await supabase
        .from('user_profiles')
        .select('telegram_chat_id')
        .in('role', ['ADMIN', 'DEPT_HEAD', 'SUPERADMIN'])
        .not('telegram_chat_id', 'is', null)
      chatIds = (deptHeads || []).map((u: { telegram_chat_id: string }) => u.telegram_chat_id)

    } else if (status === 'DH_APPROVED' || status === 'FIN_PENDING') {
      message = [
        `✅ *Money Request Approved by DH*`,
        ``,
        `📋 Request: *${reqNo}* — Dept: ${dept}`,
        `💵 Amount: SAR ${amount}`,
        ``,
        `⏳ Awaiting Finance approval.`,
      ].join('\n')

      // Notify finance/accounts team
      const { data: finance } = await supabase
        .from('user_profiles')
        .select('telegram_chat_id')
        .in('role', ['ADMIN', 'SUPERADMIN'])
        .not('telegram_chat_id', 'is', null)
      chatIds = (finance || []).map((u: { telegram_chat_id: string }) => u.telegram_chat_id)

    } else if (status === 'FUNDS_SENT') {
      message = `💸 *Funds Sent* — ${reqNo}\nDept: ${dept} | SAR ${amount}`
      // Get requester's Telegram
      if (mr.requested_by) {
        const { data: emp } = await supabase
          .from('employees').select('telegram_chat_id').eq('id', mr.requested_by).single()
        if (emp?.telegram_chat_id) chatIds = [emp.telegram_chat_id]
      }

    } else if (status === 'REJECTED') {
      message = `❌ *Money Request Rejected*\n${reqNo} — ${dept}\nSAR ${amount}`
      if (mr.requested_by) {
        const { data: emp } = await supabase
          .from('employees').select('telegram_chat_id').eq('id', mr.requested_by).single()
        if (emp?.telegram_chat_id) chatIds = [emp.telegram_chat_id]
      }
    }
  }

  // ─── PURCHASE ORDER ──────────────────────────────────────────
  else if (table === 'purchase_orders') {
    const po = record
    const status = po.status as string
    const poNo   = po.po_number as string || 'PO-???'
    const dept   = po.department as string || ''
    const amount = (po.total_amount as number || 0).toFixed(2)

    if (status === 'DRAFT') {
      message = [
        `📦 *New PO Request*`,
        ``,
        `📋 PO: *${poNo}* — Dept: ${dept}`,
        `💵 Total: SAR ${amount}`,
        ``,
        `⏳ Awaiting Approval`,
      ].join('\n')

      const { data: admins } = await supabase
        .from('user_profiles').select('telegram_chat_id')
        .in('role', ['ADMIN','DEPT_HEAD','SUPERADMIN']).not('telegram_chat_id','is',null)
      chatIds = (admins||[]).map((u: { telegram_chat_id: string }) => u.telegram_chat_id)
    }
  }

  // ─── EXPENSE SUBMISSION ──────────────────────────────────────
  else if (table === 'expenses') {
    const exp = record
    const reqNo = exp.request_number as string || 'EXP-???'
    const dept  = exp.department as string || ''
    const amount = (exp.total_amount as number || 0).toFixed(2)
    const cat   = exp.expense_category as string || ''

    message = [
      `💸 *Expense Submitted*`,
      ``,
      `📋 Ref: *${reqNo}*`,
      `🏢 Dept: ${dept}  |  Category: ${cat}`,
      `💵 Amount: SAR ${amount}`,
      ``,
      `Status: Awaiting approval`,
    ].join('\n')

    // Notify dept heads
    const { data: deptHeads } = await supabase
      .from('user_profiles').select('telegram_chat_id')
      .in('role', ['ADMIN','DEPT_HEAD','SUPERADMIN']).not('telegram_chat_id','is',null)
    chatIds = (deptHeads||[]).map((u: { telegram_chat_id: string }) => u.telegram_chat_id)
  }

  // ─── OVERTIME ────────────────────────────────────────────────
  else if (table === 'overtime_submissions') {
    const ot    = record
    const reqNo = ot.request_number as string || 'OT-???'
    const dept  = ot.department as string || ''
    const hours = ot.total_hours as number || 0
    const amt   = (ot.ot_amount as number || 0).toFixed(2)

    message = [
      `⏱️ *Overtime Submitted*`,
      ``,
      `📋 Ref: *${reqNo}*  |  Dept: ${dept}`,
      `⏰ Hours: ${hours} hrs`,
      `💵 OT Amount: SAR ${amt}`,
    ].join('\n')

    const { data: deptHeads } = await supabase
      .from('user_profiles').select('telegram_chat_id')
      .in('role', ['ADMIN','DEPT_HEAD','SUPERADMIN']).not('telegram_chat_id','is',null)
    chatIds = (deptHeads||[]).map((u: { telegram_chat_id: string }) => u.telegram_chat_id)
  }

  // ─── FOOD ALLOWANCE ──────────────────────────────────────────
  else if (table === 'food_allowances') {
    const fa    = record
    const reqNo = fa.request_number as string || 'FA-???'
    const dept  = fa.department as string || ''
    const amt   = (fa.total_amount as number || 0).toFixed(2)

    message = [
      `🍽️ *Food Allowance Submitted*`,
      ``,
      `📋 Ref: *${reqNo}*  |  Dept: ${dept}`,
      `💵 Amount: SAR ${amt}`,
    ].join('\n')

    const { data: deptHeads } = await supabase
      .from('user_profiles').select('telegram_chat_id')
      .in('role', ['ADMIN','DEPT_HEAD','SUPERADMIN']).not('telegram_chat_id','is',null)
    chatIds = (deptHeads||[]).map((u: { telegram_chat_id: string }) => u.telegram_chat_id)
  }

  // ─── Send to all relevant chat IDs ───────────────────────────
  if (!message || chatIds.length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: 'No message or no recipients' }), { status: 200 })
  }

  // Deduplicate
  const uniqueIds = [...new Set(chatIds.filter(Boolean))]
  const results = await Promise.allSettled(
    uniqueIds.map(chatId =>
      fetch(`${TELEGRAM_API}${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    chatId,
          text:       message,
          parse_mode: 'Markdown',
        }),
      })
    )
  )

  const sent    = results.filter(r => r.status === 'fulfilled').length
  const failed  = results.filter(r => r.status === 'rejected').length

  return new Response(JSON.stringify({
    ok: true, table, type, status: record.status,
    recipients: uniqueIds.length, sent, failed,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})
