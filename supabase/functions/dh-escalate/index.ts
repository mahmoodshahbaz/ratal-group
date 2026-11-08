/**
 * dh-escalate — Daily Cron Edge Function
 *
 * Runs every day at 09:00 AST via Supabase Cron (pg_cron).
 * Checks all FUNDS_SENT money requests without DH acknowledgment
 * and escalates according to the age of the payment:
 *
 *   Days  0-15 : Send DH_PAYMENT_ACK reminder via Telegram (daily)
 *   Days 15-30 : Also mark with WARNING badge (notification type escalates)
 *   Days   30+ : Set dh_blocked = TRUE, block new MRs for that party
 *
 * ── Deploy ─────────────────────────────────────────────────────
 *   npx supabase functions deploy dh-escalate
 *
 * ── Register as daily cron ──────────────────────────────────────
 *   In Supabase Dashboard → Database → Extensions → pg_cron, then:
 *
 *   SELECT cron.schedule(
 *     'dh-escalate-daily',
 *     '0 6 * * *',   -- 09:00 AST = 06:00 UTC
 *     $$
 *       SELECT net.http_post(
 *         url     => 'https://<PROJECT_REF>.supabase.co/functions/v1/dh-escalate',
 *         headers => '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
 *         body    => '{}'::jsonb
 *       ) AS request_id;
 *     $$
 *   );
 *
 * ── Secrets ─────────────────────────────────────────────────────
 *   TELEGRAM_BOT_TOKEN        = <bot token>
 *   SUPABASE_URL              = <auto-set>
 *   SUPABASE_SERVICE_ROLE_KEY = <auto-set>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_API = 'https://api.telegram.org/bot'

function daysSince(ts: string | null): number {
  if (!ts) return 0
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
}

Deno.serve(async () => {
  const SUPA_URL    = Deno.env.get('SUPABASE_URL')              || ''
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const BOT_TOKEN   = Deno.env.get('TELEGRAM_BOT_TOKEN')        || ''

  const supabase = createClient(SUPA_URL, SERVICE_KEY)

  // ── 1. Fetch all FUNDS_SENT MRs without DH ack ──────────────────────────────
  const { data: unacked, error } = await supabase
    .from('money_requests')
    .select(`
      id, entity_id, mr_number, request_number, title, purpose,
      amount, funds_sent_at, party_id, party_name, contractor_id,
      dh_acked_at, dh_ack_status, dh_blocked,
      department_id, requested_by
    `)
    .eq('status', 'FUNDS_SENT')
    .is('dh_acked_at', null)
    .neq('dh_ack_status', 'CONFIRMED')   // safety: skip field-confirmed ones
    .not('funds_sent_at', 'is', null)

  if (error) {
    console.error('dh-escalate fetch error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results = {
    processed: 0,
    reminders: 0,
    warnings:  0,
    blocked:   0,
    errors:    [] as string[],
  }

  for (const mr of (unacked || [])) {
    const age    = daysSince(mr.funds_sent_at)
    // Prefer mr_number (mobile-submitted), fallback to request_number (admin-assigned)
    const mrRef  = mr.mr_number || mr.request_number || mr.id.slice(0, 8)
    // Prefer party_name, fallback to purpose or title
    const party  = mr.party_name || mr.title || mr.purpose || 'Party'
    // The employee who raised the request (UUID FK)
    const raisedBy: string | null = mr.requested_by || null

    try {

      // ── 2. 30+ days: block the party ──────────────────────────────────────────
      if (age >= 30 && !mr.dh_blocked) {
        await supabase
          .from('money_requests')
          .update({ dh_blocked: true })
          .eq('id', mr.id)

        await supabase.from('notifications').insert({
          entity_id:   mr.entity_id,
          employee_id: raisedBy,
          type:        'DH_PAYMENT_ACK',
          title:       `⛔ BLOCKED: ${mrRef} — ${party} (${age} days unacknowledged)`,
          body:        `Money Request ${mrRef} has not been acknowledged by the DH for ${age} days. New MRs for this party are now BLOCKED until acknowledged.`,
          metadata:    { mr_id: mr.id, amount: mr.amount, age_days: age, escalation: 'BLOCKED' },
        })

        results.blocked++
      }

      // ── 3. 15-30 days: WARNING escalation notification ────────────────────────
      if (age >= 15 && age < 30) {
        await supabase.from('notifications').insert({
          entity_id:   mr.entity_id,
          employee_id: raisedBy,
          type:        'DH_PAYMENT_ACK',
          title:       `⚠️ WARNING: ${mrRef} overdue ${age} days`,
          body:        `DH has not acknowledged ${mrRef} (${party}) for ${age} days. Blocking in ${30 - age} days if not acknowledged.`,
          metadata:    { mr_id: mr.id, amount: mr.amount, age_days: age, escalation: 'WARNING' },
        })

        results.warnings++
      }

      // ── 4. 0-15 days: daily reminder to DH ────────────────────────────────────
      if (age < 30) {
        // Find DH for this department
        let dhEmpId: string | null = null
        if (mr.department_id) {
          const { data: dhEmp } = await supabase
            .from('employees')
            .select('id')
            .eq('entity_id', mr.entity_id)
            .eq('department_id', mr.department_id)
            .ilike('designation', '%Department Head%')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()
          dhEmpId = dhEmp?.id || null
        }

        // Fallback: notify the person who raised the MR
        if (!dhEmpId) dhEmpId = raisedBy

        if (dhEmpId) {
          await supabase.from('notifications').insert({
            entity_id:   mr.entity_id,
            employee_id: dhEmpId,
            type:        'DH_PAYMENT_ACK',
            title:       `Payment Acknowledgment Required — ${mrRef}`,
            body:        `SAR ${Number(mr.amount || 0).toLocaleString()} has been disbursed for ${party}. Please acknowledge in the DH Command Centre. Day ${age} of 30.`,
            metadata:    { mr_id: mr.id, amount: mr.amount, age_days: age, escalation: 'REMINDER' },
          })
          results.reminders++
        }
      }

      results.processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.errors.push(`${mrRef}: ${msg}`)
    }
  }

  console.log('dh-escalate results:', results)
  return new Response(JSON.stringify({ success: true, ...results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
