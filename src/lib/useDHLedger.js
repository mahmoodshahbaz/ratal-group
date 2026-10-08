/**
 * useDHLedger.js — DH Cash Accountability Hook
 *
 * Loads all advances issued by this DH and computes:
 *   - Per-employee balance (FIFO oldest unsettled)
 *   - Summary totals for the DH dashboard panel
 *
 * Phase B covers Track A (cash advances) only.
 * Track B (supplier/subcon vouchers) is wired in Phase E (DH Dashboard).
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const IN_TYPES  = ['ADVANCE_IN', 'TRANSFER_IN']
const OUT_TYPES = ['CLAIM_SETTLED', 'RETURN_TO_DH']

export function useDHLedger(dhEmployeeId, entityId) {
  const [state, setState] = useState({
    loading:   true,
    employees: [],   // sorted by current_balance DESC
    summary:   { total_issued: 0, total_recovered: 0, outstanding: 0, employee_count: 0 },
    error:     null,
  })

  const load = useCallback(async () => {
    if (!dhEmployeeId) return
    setState(s => ({ ...s, loading: true }))

    try {
      let query = supabase
        .from('employee_advances')
        .select(`
          id,
          employee_id,
          advance_date,
          amount,
          txn_type,
          status,
          reference,
          notes,
          source_bank_account_id,
          employee:employee_id (
            id,
            full_name_en,
            full_name_ar,
            designation,
            phone_number,
            mobile_number,
            department:department_id ( dept_name )
          )
        `)
        .eq('issued_by', dhEmployeeId)
        .order('advance_date', { ascending: false })

      if (entityId) query = query.eq('entity_id', entityId)

      const { data: advances, error } = await query

      if (error) throw error

      // ── Group by employee ───────────────────────────────────
      const empMap = {}
      for (const adv of (advances || [])) {
        const eid = adv.employee_id
        if (!empMap[eid]) {
          empMap[eid] = {
            employee:         adv.employee,
            transactions:     [],
            total_received:   0,
            total_settled:    0,
            oldest_unsettled: null,  // FIFO ageing
          }
        }
        empMap[eid].transactions.push(adv)

        if (IN_TYPES.includes(adv.txn_type)) {
          empMap[eid].total_received += parseFloat(adv.amount) || 0
          // FIFO: track oldest ISSUED advance
          if (adv.status === 'ISSUED') {
            const d = adv.advance_date
            if (!empMap[eid].oldest_unsettled || d < empMap[eid].oldest_unsettled) {
              empMap[eid].oldest_unsettled = d
            }
          }
        }
        if (OUT_TYPES.includes(adv.txn_type)) {
          empMap[eid].total_settled += parseFloat(adv.amount) || 0
        }
      }

      // ── Compute balances + sort ─────────────────────────────
      const employees = Object.values(empMap)
        .map(e => ({
          ...e,
          current_balance: e.total_received - e.total_settled,
          days_oldest: e.oldest_unsettled
            ? Math.floor((Date.now() - new Date(e.oldest_unsettled)) / 86400000)
            : 0,
        }))
        .sort((a, b) => b.current_balance - a.current_balance)

      const summary = {
        total_issued:    employees.reduce((s, e) => s + e.total_received, 0),
        total_recovered: employees.reduce((s, e) => s + e.total_settled, 0),
        outstanding:     employees.reduce((s, e) => s + e.current_balance, 0),
        employee_count:  employees.filter(e => e.current_balance > 0).length,
      }

      setState({ loading: false, employees, summary, error: null })
    } catch (err) {
      console.error('useDHLedger:', err)
      setState(s => ({ ...s, loading: false, error: err.message }))
    }
  }, [dhEmployeeId, entityId])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}
