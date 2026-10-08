/**
 * FIELD FOOD ALLOWANCE FORM
 * Remote sites: zero fields — one tap claim
 * Local sites:  disabled (handled by FieldPortal before reaching here)
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { postToSheet } from '../lib/googleSheets'

export default function FieldFood({ person, assignment }) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const dailyRate = person?.food_allowance_rate || 30

  const isRemote = assignment?.is_remote !== false   // true unless explicitly local

  async function claim() {
    setSubmitting(true)
    const today = new Date().toISOString().split('T')[0]
    const foodPayload = {
      employee_id:    person.id,
      claim_date:     today,
      daily_rate:     dailyRate,
      is_remote:      isRemote,
      site_master_id: assignment?.site_master_id || null,
      sm_id:          assignment?.sm_id || assignment?.site_masters?.sm_id || null,
      status:         'PENDING',
    }
    const [{ error }] = await Promise.all([
      supabase.from('food_allowances').insert(foodPayload),
      postToSheet('food', foodPayload),
    ])
    setSubmitting(false)
    if (error) {
      if (error.code === '23505') { alert('Already claimed for today'); return }
      alert(error.message); return
    }
    setSubmitted(true)
  }

  const S = {
    card:  { background:'#fff', borderRadius:20, padding:32, width:'100%', maxWidth:440, boxShadow:'0 4px 20px rgba(0,0,0,0.10)', textAlign:'center' },
    amt:   { fontSize:52, fontWeight:900, color:'#2e7d32', margin:'16px 0 4px' },
    sub:   { fontSize:14, color:'#6b7c93', marginBottom:28 },
    btn:   { background:'linear-gradient(135deg,#2e7d32,#43a047)', color:'#fff', border:'none', borderRadius:14, padding:'18px', fontSize:18, fontWeight:800, cursor:'pointer', width:'100%' },
    site:  { background:'#e8f5e9', borderRadius:12, padding:'10px 14px', marginBottom:24, textAlign:'left' },
  }

  if (submitted) return (
    <div style={S.card}>
      <div style={{ fontSize:60 }}>✅</div>
      <div style={{ fontSize:22, fontWeight:800, color:'#2e7d32', marginTop:16, marginBottom:8 }}>Allowance Claimed!</div>
      <div style={{ color:'#6b7c93' }}>SAR {dailyRate} recorded for today</div>
    </div>
  )

  return (
    <div style={S.card}>
      <div style={{ fontSize:32, marginBottom:8 }}>🍽️</div>
      <div style={{ fontSize:20, fontWeight:800, color:'#1a2540' }}>Food Allowance</div>

      <div style={S.amt}>SAR {dailyRate}</div>
      <div style={S.sub}>Daily remote site allowance</div>

      {assignment && (
        <div style={S.site}>
          <div style={{ fontSize:11, color:'#2e7d32', fontWeight:800, marginBottom:2 }}>TODAY'S SITE</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#1a2540' }}>
            {assignment.site_masters?.site_name || assignment.sm_id}
          </div>
        </div>
      )}

      <button style={S.btn} onClick={claim} disabled={submitting}>
        {submitting ? 'Submitting…' : '✓ Claim Today\'s Allowance'}
      </button>
      <div style={{ fontSize:11, color:'#aab2bd', marginTop:12 }}>One claim per day per site</div>
    </div>
  )
}
