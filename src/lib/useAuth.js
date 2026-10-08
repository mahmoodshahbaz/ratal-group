import React, { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,  setSession]  = useState(null)
  const [profile,  setProfile]  = useState(null)  // user_profiles row
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    // 1. Get existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadProfile(s.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    // Step 1: get profile row directly (no FK join — avoids silent failures)
    const { data: prof, error: profErr } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profErr || !prof) { setProfile(null); setLoading(false); return }

    // Step 2: fetch entity separately by entity_code
    let entityData = null
    if (prof.entity_code && prof.entity_code !== 'ALL') {
      const { data: ent } = await supabase
        .from('entities')
        .select('id, entity_code, entity_name, entity_name_ar, entity_type, color')
        .eq('entity_code', prof.entity_code)
        .single()
      entityData = ent
    }

    setProfile({ ...prof, entities: entityData })
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const value = {
    session,
    profile,
    loading,
    signOut,
    // Convenience flags
    role:        profile?.role || 'VIEWER',
    entityCode:  profile?.entity_code || 'RAT',
    entityId:    profile?.entities?.id || null,
    entity:      profile?.entities || null,
    department:  profile?.department || null,
    isSuperAdmin: profile?.role === 'SUPERADMIN',
    isAdmin:      ['SUPERADMIN','ADMIN'].includes(profile?.role),
    isDeptHead:   profile?.role === 'DEPT_HEAD',
    isPM:         profile?.role === 'PROJECT_MANAGER',
    isTravelAgent:profile?.role === 'TRAVEL_AGENT',
    isField:      profile?.role === 'FIELD_EMPLOYEE',
    // Can the user see a given module?
    can: (action, module) => canDo(profile?.role, action, module),
  }

  return React.createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  return useContext(AuthContext)
}

// ─── Permission matrix ───────────────────────────────────────
// action: 'view' | 'create' | 'approve' | 'delete'
// module: key string matching NAV keys
function canDo(role, action, module) {
  if (!role) return false
  if (role === 'SUPERADMIN') return true
  if (role === 'ADMIN') return true  // Admin sees everything

  const permissions = {
    DEPT_HEAD: {
      view:    ['dashboard','employees','money_requests','purchase_orders','projects','overtime','food_allowance','invoices','payments','reports'],
      create:  ['money_requests','purchase_orders','expenses'],
      approve: ['money_requests','purchase_orders','overtime','food_allowance'],
      delete:  [],
    },
    PROJECT_MANAGER: {
      view:    ['dashboard','projects','money_requests','overtime','food_allowance'],
      create:  ['money_requests','expenses','overtime','food_allowance'],
      approve: [],
      delete:  [],
    },
    TRAVEL_AGENT: {
      view:    ['dashboard','new_ticket','customers','airlines','bsp','refunds','reports'],
      create:  ['new_ticket','refunds'],
      approve: [],
      delete:  [],
    },
    FIELD_EMPLOYEE: {
      view:    ['dashboard'],
      create:  ['expenses','food_allowance','overtime'],
      approve: [],
      delete:  [],
    },
    VIEWER: {
      view:    ['dashboard'],
      create:  [],
      approve: [],
      delete:  [],
    },
  }

  const perms = permissions[role]
  if (!perms) return false
  return (perms[action] || []).includes(module)
}
