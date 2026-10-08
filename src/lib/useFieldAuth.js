/**
 * useFieldAuth.js — QR-based field authentication hook
 *
 * Flow:
 *  1. Employee scans QR code → opens /forms?t=TOKEN
 *  2. Hook reads token from URL → validates against qr_tokens table
 *  3. Stores token in sessionStorage (persists navigation, clears on browser close)
 *  4. Returns employee profile + role + site assignments
 *  5. If employee.status = INACTIVE or token.is_active = false → access denied
 *
 * Security:
 *  - Token is a random string — not a password, not a JWT
 *  - Supabase anon key reads qr_tokens (SELECT only policy)
 *  - No service_role key used client-side
 *  - sessionStorage clears when browser/tab closes
 */

import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const STORAGE_KEY  = 'accsys_field_token'
const ENTITY_KEY   = 'accsys_field_entity'

// ── Role definitions ────────────────────────────────────────────────────────

export const ROLES = {
  STAFF_TECH:       'STAFF_TECH',
  STAFF_SUPERVISOR: 'STAFF_SUPERVISOR',
  STAFF_PM:         'STAFF_PM',
  STAFF_DH:         'STAFF_DH',
  SUBCONTRACTOR:    'SUBCONTRACTOR',
  OUTSOURCED:       'OUTSOURCED',
  DRIVER:           'DRIVER',
  FINANCE:          'FINANCE',
}

export const ROLE_LABELS = {
  STAFF_TECH:       'Field Technician',
  STAFF_SUPERVISOR: 'Supervisor',
  STAFF_PM:         'Project Manager',
  STAFF_DH:         'Department Head',
  SUBCONTRACTOR:    'Sub-Contractor',
  OUTSOURCED:       'Outsourced Staff',
  DRIVER:           'Driver',
  FINANCE:          'Finance / Accounts',
}

export const ROLE_COLORS = {
  STAFF_TECH:       '#1565c0',
  STAFF_SUPERVISOR: '#6a1b9a',
  STAFF_PM:         '#004d40',
  STAFF_DH:         '#b71c1c',
  SUBCONTRACTOR:    '#e65100',
  OUTSOURCED:       '#37474f',
  DRIVER:           '#1b5e20',
  FINANCE:          '#880e4f',
}

// ── Forms visible per role ───────────────────────────────────────────────────
// Does NOT include eligibility checks (food/overtime) — those are applied separately

export const ROLE_FORM_ACCESS = {
  STAFF_TECH:       ['expense_daily','expense_claim','food_allowance','overtime','site_completion','payment_validation'],
  STAFF_SUPERVISOR: ['expense_daily','expense_claim','food_allowance','overtime','site_completion','money_request','po_request','payment_validation'],
  STAFF_PM:         ['expense_daily','expense_claim','food_allowance','overtime','site_completion','money_request','po_request','field_payment','payment_validation','dh_dashboard'],
  STAFF_DH:         ['expense_daily','expense_claim','food_allowance','overtime','site_completion','money_request','po_request','field_payment','subcon_claim','car_maintenance','payment_validation','dh_dashboard'],
  SUBCONTRACTOR:    ['site_completion','subcon_claim','payment_validation'],
  OUTSOURCED:       ['expense_daily','expense_claim','site_completion','payment_validation'],
  DRIVER:           ['expense_daily','expense_claim','car_maintenance','payment_validation'],
  FINANCE:          ['expense_daily','expense_claim','food_allowance','overtime','site_completion','money_request','po_request','field_payment','subcon_claim','car_maintenance','payment_validation','dh_dashboard'],
}

// ── Main hook ────────────────────────────────────────────────────────────────

export function useFieldAuth() {
  const [state, setState] = useState({
    loading:        true,
    employee:       null,   // full employee object from DB
    role:           null,   // string from ROLES
    employmentType: null,   // STAFF | OUTSOURCED | SUBCONTRACTOR
    entityId:       null,
    assignments:    [],     // site_assignments[] for this employee
    allowedForms:   [],     // keys of forms this role+eligibility can see
    error:          null,   // null | 'no_token' | 'invalid_token' | 'token_inactive' | 'employee_inactive'
    tokenId:        null,
  })

  useEffect(() => {
    init()
  }, [])

  async function init() {
    // 1. Check URL for ?t=TOKEN
    const params   = new URLSearchParams(window.location.search)
    const urlToken = params.get('t')

    // ── DEV BYPASS ── Add ?dev=1 to URL or set localStorage to skip QR auth ──
    const devMode = params.get('dev') === '1' || localStorage.getItem('accsys_dev_mode') === '1'
    if (devMode) {
      // Load a REAL employee from the DB so form submissions actually work
      try {
        const { data: emps, error: empErr } = await supabase.rpc('get_dev_employees')
        if (empErr) console.warn('[DevMode] get_dev_employees failed:', empErr.message)
        const emp = emps?.[0] || null

        if (emp) {
          const { data: assignments } = await supabase
            .from('site_assignments')
            .select('id, site_number, site_name, scope_type, role_on_site, assigned_from, assigned_to, project:project_id(id,project_number,project_name), contractor:contractor_id(id,contractor_name)')
            .eq('employee_id', emp.id)
            .eq('is_active', true)
            .order('assigned_from', { ascending: false })

          const allForms = ROLE_FORM_ACCESS['STAFF_DH']
          setState({
            loading:        false,
            employee:       { ...emp, entityId: emp.entity_id },
            role:           'STAFF_DH',
            employmentType: emp.employment_type || 'STAFF',
            entityId:       emp.entity_id,
            assignments:    assignments || [],
            allowedForms:   [...allForms, 'dh_dashboard'],
            unreadCount:    0,
            error:          null,
            tokenId:        'dev-token',
          })
          return
        }
      } catch (_) { /* fall through to fake data if DB not available */ }

      // Fallback: truly fake data (won't save to DB, but shows the UI)
      const allForms = ROLE_FORM_ACCESS['STAFF_DH']
      setState({
        loading:        false,
        employee: {
          id: 'dev-001', full_name_en: 'Dev Test User', full_name_ar: 'مستخدم اختبار',
          designation: 'Department Head', job_title: 'DH - Testing',
          mobile_number: '0500000000', iban: null, status: 'ACTIVE',
          food_allowance_eligible: true, overtime_eligible: true,
          employment_type: 'STAFF', entityId: null,
          department: { dept_code: 'DEV', dept_name: 'Development / Test' },
        },
        role: 'STAFF_DH', employmentType: 'STAFF', entityId: null,
        assignments: [], allowedForms: [...allForms, 'dh_dashboard'],
        unreadCount: 0, error: null, tokenId: 'dev-token',
      })
      return
    }
    // ─────────────────────────────────────────────────────────────────────────

    // 2. Fall back to sessionStorage
    const token = urlToken || sessionStorage.getItem(STORAGE_KEY)

    if (!token) {
      setState(s => ({ ...s, loading: false, error: 'no_token' }))
      return
    }

    // 3. If fresh from URL — store it and clean the URL
    if (urlToken) {
      sessionStorage.setItem(STORAGE_KEY, urlToken)
      const cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete('t')
      window.history.replaceState({}, '', cleanUrl.toString())
    }

    await validateToken(token)
  }

  async function validateToken(token) {
    try {
      // Query qr_tokens joining employee + department
      const { data: qt, error: qtErr } = await supabase
        .from('qr_tokens')
        .select(`
          id,
          role,
          employment_type,
          is_active,
          entity_id,
          employee:employee_id (
            id,
            full_name_en,
            full_name_ar,
            department_id,
            mobile_number,
            phone_number,
            iban,
            designation,
            job_title,
            employment_type,
            overtime_eligible,
            food_allowance_eligible,
            status,
            department:department_id ( dept_code, dept_name )
          )
        `)
        .eq('token', token)
        .maybeSingle()

      if (qtErr || !qt) {
        _clearAndFail('invalid_token')
        return
      }

      // Token must be active
      if (!qt.is_active) {
        _clearAndFail('token_inactive')
        return
      }

      // Employee must be active
      if (qt.employee?.status === 'INACTIVE' || qt.employee?.status === 'TERMINATED') {
        _clearAndFail('employee_inactive')
        return
      }

      // Update last_used_at silently (fire and forget)
      supabase
        .from('qr_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', qt.id)

      // Load this employee's active site assignments
      const { data: assignments } = await supabase
        .from('site_assignments')
        .select(`
          id,
          site_number,
          site_name,
          scope_type,
          role_on_site,
          assigned_from,
          assigned_to,
          project:project_id ( id, project_number, project_name ),
          contractor:contractor_id ( id, contractor_name )
        `)
        .eq('employee_id', qt.employee.id)
        .eq('is_active', true)
        .order('assigned_from', { ascending: false })

      // Load unread notification count
      const { count: unreadCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', qt.employee.id)
        .eq('is_read', false)

      // Compute which forms this employee can access
      const baseForms  = ROLE_FORM_ACCESS[qt.role] || []
      const emp        = qt.employee
      const allowedForms = baseForms.filter(f => {
        if (f === 'food_allowance' && !emp.food_allowance_eligible) return false
        if (f === 'overtime'       && !emp.overtime_eligible)        return false
        return true
      })

      // Store entity for subsequent form use
      sessionStorage.setItem(ENTITY_KEY, qt.entity_id || '')

      setState({
        loading:        false,
        employee:       { ...emp, entityId: qt.entity_id },
        role:           qt.role,
        employmentType: qt.employment_type || emp.employment_type || 'STAFF',
        entityId:       qt.entity_id,
        assignments:    assignments || [],
        allowedForms,
        unreadCount:    unreadCount || 0,
        error:          null,
        tokenId:        qt.id,
      })

    } catch (err) {
      console.error('useFieldAuth error:', err)
      _clearAndFail('invalid_token')
    }
  }

  function _clearAndFail(reason) {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(ENTITY_KEY)
    setState(s => ({ ...s, loading: false, error: reason }))
  }

  /** Call this to log out / switch user */
  function logout() {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(ENTITY_KEY)
    setState({
      loading: false, employee: null, role: null,
      employmentType: null, entityId: null,
      assignments: [], allowedForms: [], error: 'no_token', tokenId: null,
    })
  }

  return { ...state, logout }
}

// ── Helpers exported for use in individual forms ─────────────────────────────

/** Read stored token (for use in form components without calling the hook) */
export function getStoredToken() {
  return sessionStorage.getItem(STORAGE_KEY)
}

/** Read stored entityId */
export function getStoredEntityId() {
  return sessionStorage.getItem(ENTITY_KEY)
}

/** Check if a specific form key is accessible to the current role */
export function canAccessForm(role, formKey, employee) {
  const base = (ROLE_FORM_ACCESS[role] || []).includes(formKey)
  if (!base) return false
  if (formKey === 'food_allowance' && !employee?.food_allowance_eligible) return false
  if (formKey === 'overtime'       && !employee?.overtime_eligible)        return false
  return true
}
