// Supabase Edge Function: invite-user
// Called by the UserManagement page to send invite emails securely.
// Requires SUPABASE_SERVICE_ROLE_KEY set as an Edge Function secret.
//
// Deploy with:
//   supabase functions deploy invite-user --no-verify-jwt
//
// Or via Supabase Dashboard → Edge Functions → New Function → paste this code

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Roles an ADMIN is allowed to assign (cannot assign SUPERADMIN or ADMIN)
const ADMIN_ASSIGNABLE_ROLES = ['DEPT_HEAD','PROJECT_MANAGER','TRAVEL_AGENT','FIELD_EMPLOYEE','VIEWER']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: callerErr } = await supabaseAnon.auth.getUser(token)
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles').select('role, entity_code').eq('id', caller.id).single()
    const callerRole   = callerProfile?.role
    const callerEntity = callerProfile?.entity_code

    if (!['SUPERADMIN', 'ADMIN'].includes(callerRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden — ADMIN or SUPERADMIN role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const isSuperAdmin = callerRole === 'SUPERADMIN'
    const body   = await req.json()
    const action = body.action

    // ── INVITE ──────────────────────────────────────────────────────
    if (action === 'invite') {
      const { email, full_name, role, entity_code, department, phone } = body

      if (!email || !role || !entity_code) {
        return new Response(JSON.stringify({ error: 'email, role and entity_code are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // ADMIN cannot assign ADMIN or SUPERADMIN
      if (!isSuperAdmin && !ADMIN_ASSIGNABLE_ROLES.includes(role)) {
        return new Response(JSON.stringify({ error: `Admins cannot assign the ${role} role. Allowed: ${ADMIN_ASSIGNABLE_ROLES.join(', ')}` }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // ADMIN can only invite to their own entity
      if (!isSuperAdmin && entity_code !== callerEntity) {
        return new Response(JSON.stringify({ error: `You can only invite users to your own entity (${callerEntity})` }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, role, entity_code }
      })
      if (invErr) {
        return new Response(JSON.stringify({ error: invErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error: profErr } = await supabaseAdmin.from('user_profiles').upsert({
        id:          invited.user.id,
        email,
        full_name:   full_name || email.split('@')[0],
        role,
        entity_code,
        department:  department || null,
        phone:       phone || null,
        is_active:   true,
        invited_by:  caller.id,
        invited_at:  new Date().toISOString(),
      }, { onConflict: 'id' })

      if (profErr) {
        return new Response(JSON.stringify({ error: profErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, user_id: invited.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── UPDATE PROFILE ──────────────────────────────────────────────
    if (action === 'update_profile') {
      const { user_id, role, entity_code, department, full_name, phone, is_active } = body
      if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: corsHeaders })

      const { data: targetProfile } = await supabaseAdmin
        .from('user_profiles').select('role, entity_code').eq('id', user_id).single()

      // ADMIN cannot touch SUPERADMIN or ADMIN accounts
      if (!isSuperAdmin && ['SUPERADMIN', 'ADMIN'].includes(targetProfile?.role)) {
        return new Response(JSON.stringify({ error: 'You cannot modify SUPERADMIN or ADMIN accounts' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // ADMIN cannot assign elevated roles
      if (!isSuperAdmin && role && !ADMIN_ASSIGNABLE_ROLES.includes(role)) {
        return new Response(JSON.stringify({ error: `You cannot assign the ${role} role` }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // ADMIN cannot move users to a different entity
      if (!isSuperAdmin && entity_code && entity_code !== callerEntity) {
        return new Response(JSON.stringify({ error: 'You cannot transfer users to a different entity' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const update: Record<string, unknown> = {}
      if (role        !== undefined) update.role        = role
      if (entity_code !== undefined) update.entity_code = entity_code
      if (department  !== undefined) update.department  = department
      if (full_name   !== undefined) update.full_name   = full_name
      if (phone       !== undefined) update.phone       = phone
      if (is_active   !== undefined) update.is_active   = is_active

      const { error } = await supabaseAdmin.from('user_profiles').update(update).eq('id', user_id)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── RESET PASSWORD EMAIL ────────────────────────────────────────
    if (action === 'reset_password') {
      const { email } = body
      if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400, headers: corsHeaders })
      const { error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── DELETE USER (SUPERADMIN only) ───────────────────────────────
    if (action === 'delete_user') {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: 'Only SUPERADMIN can permanently delete users' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { user_id } = body
      if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: corsHeaders })
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: 'You cannot delete your own account' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      // Delete profile row first, then auth user
      await supabaseAdmin.from('user_profiles').delete().eq('id', user_id)
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
