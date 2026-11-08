/**
 * qr-activate — QR Token OTP Activation Edge Function
 *
 * Actions:
 *   request_otp  — Employee opens QR link for the first time → OTP generated
 *                   + emailed to admin addresses + stored (hashed) in DB
 *   verify_otp   — Employee submits OTP → verified, token activated, device bound
 *
 * Deploy:
 *   supabase functions deploy qr-activate --no-verify-jwt
 *
 * Required secrets (auto-provided by Supabase):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional secrets (for email via Resend):
 *   RESEND_API_KEY  — get from resend.com (free tier: 100 emails/day)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Admin emails that receive the OTP
const ADMIN_EMAILS = [
  'mahmood@accsyscom.com',
  'rashad@accsyscom.com',
]

// OTP validity window (minutes)
const OTP_TTL_MIN = 15

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOTP(): string {
  const arr = new Uint8Array(4)
  crypto.getRandomValues(arr)
  const num = (new DataView(arr.buffer).getUint32(0) % 900000) + 100000
  return num.toString().padStart(6, '0')
}

async function hashOTP(otp: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(otp)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

async function verifyOTP(input: string, stored: string): Promise<boolean> {
  const inputHash = await hashOTP(input)
  return inputHash === stored
}

async function sendOTPEmail(otp: string, employeeName: string, tokenId: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    // Fallback: log to console (dev mode)
    console.log(`[qr-activate] OTP for ${employeeName}: ${otp}`)
    return
  }

  const subject = `ACCSYS QR Activation — OTP: ${otp}`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
      <div style="background:#0D5C4E;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;">
        <strong style="font-size:18px;">ACCSYS Field Access</strong>
        <div style="font-size:12px;opacity:0.8;margin-top:4px;">QR Token Activation Request</div>
      </div>
      <div style="background:#fff;border:1px solid #e0e0e0;padding:20px;border-radius:0 0 10px 10px;">
        <p style="font-size:14px;color:#1a2540;">
          <strong>${employeeName}</strong> is trying to activate their QR code for ACCSYS field access.
        </p>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;text-align:center;margin:20px 0;">
          <div style="font-size:12px;color:#78909c;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">One-Time Password</div>
          <div style="font-size:40px;font-weight:900;color:#0D5C4E;letter-spacing:8px;">${otp}</div>
          <div style="font-size:11px;color:#e65100;margin-top:8px;">Valid for ${OTP_TTL_MIN} minutes only</div>
        </div>
        <p style="font-size:13px;color:#546e7a;">
          Share this OTP with the employee via WhatsApp or phone call.<br>
          Once entered, their QR will activate on that device only.
        </p>
        <p style="font-size:11px;color:#90a4ae;">
          Token ID: ${tokenId}<br>
          If you did not expect this, ignore this email — the OTP expires automatically.
        </p>
      </div>
    </div>
  `

  for (const to of ADMIN_EMAILS) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ACCSYS <noreply@accsyscom.com>',
        to,
        subject,
        html,
      }),
    })
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await req.json()
    const { action, token, otp, device_id } = body

    // ── request_otp ───────────────────────────────────────────────────────────
    if (action === 'request_otp') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'token required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Look up the token
      const { data: qt, error: fetchErr } = await supabase
        .from('qr_tokens')
        .select('id, token, is_active, activated_at, otp_sent_at, employee_id')
        .eq('token', token)
        .maybeSingle()

      if (fetchErr || !qt) {
        return new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!qt.is_active) {
        return new Response(JSON.stringify({ error: 'token_inactive' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Already activated — no OTP needed
      if (qt.activated_at) {
        return new Response(JSON.stringify({ already_activated: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Rate-limit: don't send another OTP within 60 seconds
      if (qt.otp_sent_at) {
        const secondsSinceLast = (Date.now() - new Date(qt.otp_sent_at).getTime()) / 1000
        if (secondsSinceLast < 60) {
          return new Response(JSON.stringify({ sent: true, rate_limited: true, retry_in: Math.ceil(60 - secondsSinceLast) }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }

      // Fetch employee name for the email
      const { data: emp } = await supabase
        .from('employees')
        .select('full_name_en, full_name')
        .eq('id', qt.employee_id)
        .maybeSingle()
      const employeeName = emp?.full_name_en || emp?.full_name || 'Unknown Employee'

      // Generate OTP
      const plainOTP   = generateOTP()
      const hashedOTP  = await hashOTP(plainOTP)
      const expiresAt  = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString()

      // Store hashed OTP
      await supabase.from('qr_tokens').update({
        otp_code:       hashedOTP,
        otp_expires_at: expiresAt,
        otp_sent_at:    new Date().toISOString(),
      }).eq('id', qt.id)

      // Send email to admins
      await sendOTPEmail(plainOTP, employeeName, qt.id)

      return new Response(JSON.stringify({ sent: true, employee_name: employeeName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── verify_otp ────────────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      if (!token || !otp) {
        return new Response(JSON.stringify({ error: 'token and otp required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: qt, error: fetchErr } = await supabase
        .from('qr_tokens')
        .select('id, otp_code, otp_expires_at, is_active, activated_at')
        .eq('token', token)
        .maybeSingle()

      if (fetchErr || !qt) {
        return new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Already activated (allow re-verify on same device)
      if (qt.activated_at) {
        return new Response(JSON.stringify({ success: true, already_activated: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!qt.otp_code || !qt.otp_expires_at) {
        return new Response(JSON.stringify({ error: 'no_otp_requested' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Check expiry
      if (new Date(qt.otp_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'otp_expired' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Verify OTP
      const valid = await verifyOTP(otp.trim(), qt.otp_code)
      if (!valid) {
        return new Response(JSON.stringify({ error: 'invalid_otp' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Activate: set activated_at, bind device, clear OTP
      const deviceFingerprint = device_id || req.headers.get('user-agent') || 'unknown'
      await supabase.from('qr_tokens').update({
        activated_at:   new Date().toISOString(),
        bound_mobile:   deviceFingerprint,
        otp_code:       null,
        otp_expires_at: null,
      }).eq('id', qt.id)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
