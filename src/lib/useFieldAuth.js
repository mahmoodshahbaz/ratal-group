/**
 * useFieldAuth.js — QR-based field authentication hook
 */

import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const STORAGE_KEY  = 'accsys_field_token'
const ENTITY_KEY   = 'accsys_field_entity'

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

export function useFieldAuth() {
  const [state, setState] = useState({
    loading:        true,
    employee:       null,
    role:           null,
    employmentType: null,
    entityId:       null,
    assignments:    [],
    allowedForms:   [],
    error:          null,
    debugError:     null,
    tokenId:        null,
    siteScopeId:    null,
    boundMobile:    null,
    expiresAt:      null,
  })

  useEffect(() => { init() }, [])

  async function init() {
    const params   = new URLSearchParams(window.location.search)
    const urlToken = params.get('t')

    const devMode = params.get('dev') === '1' || params.get('preview') === '1' || localStorage.getItem('accsys_dev_mode') === '1'
    if (devMode) {
      try {
        const { data: emps } = await supabase.rpc('get_dev_employees')
        const emp = emps?.[0] || null
        if (emp) {
          const { data: assignments } = await supabase
            .from('site_assignments')
            .select('id, site_number, site_name, scope_type, role_on_site, assigned_from, assigned_to, project:project_id(id,project_number,project_name), contractor:contractor_id(id,contractor_name)')
            .eq('employee_id', emp.id).eq('is_active', true).order('assigned_from', { ascending: false })
          const allForms = ROLE_FORM_ACCESS['STAFF_DH']
          setState({ loading: false, employee: { ...emp, entityId: emp.entity_id }, role: 'STAFF_DH', employmentType: emp.employment_type || 'STAFF', entityId: emp.entity_id, assignments: assignments || [], allowedForms: [...allForms, 'dh_dashboard'], unreadCount: 0, error: null, tokenId: 'dev-token' })
          return
        }
      } catch (_) {}
      const allForms = ROLE_FORM_ACCESS['STAFF_DH']
      setState({ loading: false, employee: { id: 'dev-001', full_name_en: 'Dev Test User', full_name_ar: 'مستخدم اختبار', designation: 'Department Head', job_title: 'DH - Testing', mobile_number: '0500000000', iban: null, status: 'ACTIVE', food_allowance_eligible: true, overtime_eligible: true, employment_type: 'STAFF', entityId: null, department: { dept_code: 'DEV', dept_name: 'Development / Test' } }, role: 'STAFF_DH', employmentType: 'STAFF', entityId: null, assignments: [], allowedForms: [...allForms, 'dh_dashboard'], unreadCount: 0, error: null, tokenId: 'dev-token' })
      return
    }

    const token = urlToken || sessionStorage.getItem(STORAGE_KEY)
    if (!token) { setState(s => ({ ...s, loading: false, error: 'no_token' })); return }

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
      const { data: result, error: rpcErr } = await supabase
        .rpc('validate_field_qr_token', { p_token: token })

      if (rpcErr) {
        setState(s => ({ ...s, loading: false, error: 'invalid_token', debugError: `RPC error: ${rpcErr.message}` }))
        sessionStorage.removeItem(STORAGE_KEY)
        return
      }

      if (result?.error) {
        const reason = result.error === 'token_inactive'    ? 'token_inactive'
                     : result.error === 'token_expired'     ? 'token_expired'
                     : result.error === 'employee_inactive' ? 'employee_inactive'
                     : 'invalid_token'
        setState(s => ({ ...s, loading: false, error: reason, debugError: `DB says: ${result.error}` }))
        sessionStorage.removeItem(STORAGE_KEY)
        return
      }

      if (!result || !result.token_id) {
        setState(s => ({ ...s, loading: false, error: 'invalid_token', debugError: 'RPC returned empty result' }))
        sessionStorage.removeItem(STORAGE_KEY)
        return
      }

      const qt = {
        id:              result.token_id,
        role:            result.role,
        employment_type: result.employment_type,
        entity_id:       result.entity_id,
        site_master_id:  result.site_master_id,
        bound_mobile:    result.bound_mobile,
        expires_at:      result.expires_at,
        employee:        result.employee,
      }

      const { data: assignments } = await supabase
        .from('site_assignments')
        .select('id, site_number, site_name, scope_type, role_on_site, assigned_from, assigned_to, allow_fa, allow_ot, allow_others, project:project_id ( id, project_number, project_name ), contractor:contractor_id ( id, contractor_name )')
        .eq('employee_id', qt.employee.id).eq('is_active', true).order('assigned_from', { ascending: false })

      const { count: unreadCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', qt.employee.id).eq('is_read', false)

      const { data: deltas } = await supabase
        .from('qr_token_forms')
        .select('form_key, is_granted')
        .eq('token_id', qt.id)

      const emp = qt.employee
      let formSet = new Set(ROLE_FORM_ACCESS[qt.role] || [])
      if (deltas?.length) { deltas.forEach(d => { if (d.is_granted) formSet.add(d.form_key); else formSet.delete(d.form_key) }) }

      const allowedForms = [...formSet].filter(f => {
        if (f === 'food_allowance' && !emp.food_allowance_eligible) return false
        if (f === 'overtime'       && !emp.overtime_eligible)        return false
        return true
      })

      sessionStorage.setItem(ENTITY_KEY, qt.entity_id || '')
      setState({ loading: false, employee: { ...emp, entityId: qt.entity_id }, role: qt.role, employmentType: qt.employment_type || emp.employment_type || 'STAFF', entityId: qt.entity_id, assignments: assignments || [], allowedForms, unreadCount: unreadCount || 0, error: null, tokenId: qt.id, siteScopeId: qt.site_master_id || null, boundMobile: qt.bound_mobile || null, expiresAt: qt.expires_at || null })

    } catch (err) {
      setState(s => ({ ...s, loading: false, error: 'invalid_token', debugError: `Exception: ${err?.message || String(err)}` }))
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(ENTITY_KEY)
    setState({ loading: false, employee: null, role: null, employmentType: null, entityId: null, assignments: [], allowedForms: [], error: 'no_token', tokenId: null, siteScopeId: null, boundMobile: null, expiresAt: null })
  }

  return { ...state, logout }
}

export function getStoredToken() { return sessionStorage.getItem(STORAGE_KEY) }
export function getStoredEntityId() { return sessionStorage.getItem(ENTITY_KEY) }
export function canAccessForm(role, formKey, employee) {
  const base = (ROLE_FORM_ACCESS[role] || []).includes(formKey)
  if (!base) return false
  if (formKey === 'food_allowance' && !employee?.food_allowance_eligible) return false
  if (formKey === 'overtime'       && !employee?.overtime_eligible)        return false
  return true
}
