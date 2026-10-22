/**
 * FormPaymentValidation.jsx — Payment Receipt Confirmation
 * Route: /forms/payment-validation
 * Auth:  useFieldAuth (any field role)
 *
 * Dark mobile-first design: black bg, yellow pending card, green confirm button.
 */

import { useState, useEffect, useCallback } from 'react'
import { useFieldAuth }                      from '../lib/useFieldAuth'
import { supabase }                          from '../lib/supabase'

const fmt     = (n) => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : ''

// ── Auth guard ────────────────────────────────────────────────────────────────
function AuthGuard({ error }) {
  const msgs = {
    no_token:          { icon: '🔒', title: 'Authentication Required', body: 'Please scan your QR code.' },
    invalid_token:     { icon: '❌', title: 'Invalid QR Code',          body: 'Contact your DH.' },
    token_inactive:    { icon: '⛔', title: 'QR Code Expired',          body: 'Ask your DH for a fresh QR.' },
    employee_inactive: { icon: '🚫', title: 'Account Inactive',         body: 'Contact HR.' },
  }
  const m = msgs[error] || msgs.no_token
  return (
    <div style={{ minHeight:'100vh', background:'#111', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#1e1e1e', borderRadius:20, padding:40, maxWidth:340, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:14 }}>{m.icon}</div>
        <div style={{ fontSize:18, fontWeight:800, color:'#ef5350', marginBottom:8 }}>{m.title}</div>
        <div style={{ fontSize:13, color:'#888' }}>{m.body}</div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FormPaymentValidation() {
  const auth = useFieldAuth()

  const [pending,   setPending]   = useState([])
  const [confirmed, setConfirmed] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [checked,   setChecked]   = useState({})
  const [saving,    setSaving]    = useState(false)

  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1'
    || new URLSearchParams(window.location.search).get('dev') === '1'

  const MOCK_PENDING = [
    { id:'p1', payment_date:'2026-10-10', total_amount:1000, payment_method:'Cash', notes:null,                  ack_status:'PENDING', submitter_name:'Accounts', project:{ project_name:'CISU-HQ' } },
    { id:'p2', payment_date:'2026-10-10', total_amount:1000, payment_method:'Cash', notes:null,                  ack_status:'PENDING', submitter_name:'Accounts', project:{ project_name:'NISU-Site A' } },
    { id:'p3', payment_date:'2026-10-10', total_amount:1000, payment_method:'Cash', notes:'October allowance',   ack_status:'PENDING', submitter_name:'Accounts', project:null },
    { id:'p4', payment_date:'2026-10-10', total_amount:1000, payment_method:'Cash', notes:null,                  ack_status:'PENDING', submitter_name:'Accounts', project:{ project_name:'TISU-Tower' } },
    { id:'p5', payment_date:'2026-10-10', total_amount:1000, payment_method:'Cash', notes:null,                  ack_status:'PENDING', submitter_name:'Accounts', project:null },
    { id:'p6', payment_date:'2026-10-10', total_amount:1000, payment_method:'Cash', notes:null,                  ack_status:'PENDING', submitter_name:'Accounts', project:null },
  ]

  const load = useCallback(async () => {
    if (!auth.employee?.id) return
    setLoading(true)

    if (isPreview) {
      setPending(MOCK_PENDING)
      setConfirmed([])
      const c = {}; for (const p of MOCK_PENDING) c[p.id] = false
      setChecked(c)
      setLoading(false)
      return
    }

    const empId = auth.employee.id
    const { data: rows, error } = await supabase
      .from('field_payments')
      .select('id, payment_date, total_amount, payment_method, notes, ack_status, ack_at, submitted_by, project:project_id(project_name)')
      .eq('employee_id', empId)
      .order('payment_date', { ascending: false })
      .limit(50)

    if (error) { console.error(error); setLoading(false); return }

    const submitterIds = [...new Set((rows || []).map(r => r.submitted_by).filter(Boolean))]
    let nameMap = {}
    if (submitterIds.length) {
      const { data: emps } = await supabase.from('employees').select('id, full_name_en').in('id', submitterIds)
      for (const e of emps || []) nameMap[e.id] = e.full_name_en
    }

    const enriched = (rows || []).map(r => ({ ...r, submitter_name: nameMap[r.submitted_by] || 'Accounts' }))
    const pend = enriched.filter(r => r.ack_status === 'PENDING' || !r.ack_status)
    const conf = enriched.filter(r => r.ack_status === 'CONFIRMED')

    setPending(pend)
    setConfirmed(conf)
    const c = {}; for (const p of pend) c[p.id] = false
    setChecked(c)
    setLoading(false)
  }, [auth.employee?.id])

  useEffect(() => { if (!auth.loading) load() }, [auth.loading, load])

  function toggle(id) { setChecked(p => ({ ...p, [id]: !p[id] })) }
  function toggleAll() {
    const anyOff = pending.some(p => !checked[p.id])
    const c = {}; for (const p of pending) c[p.id] = anyOff
    setChecked(c)
  }

  async function handleConfirm() {
    const toConfirm = pending.filter(p => checked[p.id])
    if (!toConfirm.length) { alert('Select at least one payment to confirm.'); return }
    if (isPreview) { alert(`Preview: would confirm ${toConfirm.length} payment(s).`); return }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('field_payments')
        .update({ ack_status:'CONFIRMED', ack_at: new Date().toISOString(), ack_by: auth.employee.id })
        .in('id', toConfirm.map(p => p.id))
      if (error) throw error
      await load()
    } catch (err) { alert(err.message || 'Failed. Try again.') }
    setSaving(false)
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (auth.loading) return (
    <div style={{ minHeight:'100vh', background:'#111', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#aaa', fontSize:14 }}>⏳ Verifying…</div>
    </div>
  )
  if (auth.error) return <AuthGuard error={auth.error} />

  const checkedCount = pending.filter(p => checked[p.id]).length
  const allChecked   = pending.length > 0 && pending.every(p => checked[p.id])

  // ── Full-screen sticky layout: header pinned top, list scrolls, button pinned bottom ──
  return (
    <div style={{
      position:      'fixed',
      inset:         0,
      background:    '#111',
      display:       'flex',
      flexDirection: 'column',
      fontFamily:    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      maxWidth:      480,
      margin:        '0 auto',
    }}>

      {/* ── PINNED TOP: Header ─────────────────────────────────────────── */}
      <div style={{
        flexShrink:   0,
        background:   '#1a1a1a',
        padding:      '36px 20px 16px',
        textAlign:    'center',
        borderBottom: '1px solid #2a2a2a',
      }}>
        <div style={{ fontSize:20, fontWeight:900, color:'#fff', letterSpacing:0.3 }}>
          Payment Confirmation
        </div>
        <div style={{ fontSize:12, color:'#888', marginTop:4 }}>
          Review Your Receipts &amp; Confirm
        </div>
      </div>

      {/* ── PINNED TOP: Stats bar ──────────────────────────────────────── */}
      {!loading && (
        <div style={{
          flexShrink: 0,
          display:    'grid',
          gridTemplateColumns: '1fr 1fr',
          gap:        12,
          padding:    '14px 16px',
          background: '#111',
        }}>
          <div style={{
            background:   '#4caf50',
            borderRadius: 14,
            padding:      '14px 10px',
            textAlign:    'center',
            boxShadow:    '0 4px 14px rgba(76,175,80,0.3)',
          }}>
            <div style={{ fontSize:38, fontWeight:900, color:'#c62828', lineHeight:1 }}>{pending.length}</div>
            <div style={{ fontSize:13, color:'#fff', fontWeight:700, marginTop:5 }}>Pending</div>
          </div>
          <div style={{
            background:   '#bbdefb',
            borderRadius: 14,
            padding:      '14px 10px',
            textAlign:    'center',
            boxShadow:    '0 4px 14px rgba(33,150,243,0.15)',
          }}>
            <div style={{ fontSize:38, fontWeight:900, color:'#1565c0', lineHeight:1 }}>{confirmed.length}</div>
            <div style={{ fontSize:13, color:'#1565c0', fontWeight:700, marginTop:5 }}>Confirmed</div>
          </div>
        </div>
      )}

      {/* ── SCROLLABLE MIDDLE ──────────────────────────────────────────── */}
      <div style={{
        flex:       1,
        overflowY:  'auto',
        padding:    '0 16px 12px',
        WebkitOverflowScrolling: 'touch',
      }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign:'center', padding:48, color:'#666' }}>Loading payments…</div>
        )}

        {/* All clear */}
        {!loading && pending.length === 0 && (
          <div style={{ background:'#1e1e1e', borderRadius:20, padding:'40px 24px', textAlign:'center', marginTop:8 }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#4caf50', marginBottom:6 }}>All clear!</div>
            <div style={{ fontSize:13, color:'#666' }}>
              {confirmed.length > 0
                ? `All ${confirmed.length} payment${confirmed.length > 1 ? 's' : ''} confirmed.`
                : 'No payments sent to you yet.'}
            </div>
          </div>
        )}

        {/* Pending list */}
        {!loading && pending.length > 0 && (
          <>
            {/* Select-all row */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, paddingLeft:2 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#ffa726' }}>⚡ {pending.length} Pending</div>
              <button onClick={toggleAll} style={{
                background:'none', border:'none', fontSize:12,
                color:'#90caf9', fontWeight:700, cursor:'pointer', padding:'4px 0',
              }}>
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Yellow scrollable card */}
            <div style={{
              background:   '#ffc107',
              borderRadius: 22,
              padding:      '14px 12px 16px',
              boxShadow:    '0 6px 24px rgba(255,193,7,0.35)',
            }}>
              {pending.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          10,
                    background:   '#fff',
                    borderRadius: 12,
                    padding:      '11px 12px',
                    marginBottom: idx < pending.length - 1 ? 8 : 0,
                    cursor:       'pointer',
                    boxShadow:    checked[item.id] ? '0 0 0 2.5px #4caf50' : '0 1px 3px rgba(0,0,0,0.10)',
                    transition:   'box-shadow 0.15s',
                  }}>

                  {/* Checkbox */}
                  <div style={{
                    width:46, height:46, borderRadius:8,
                    border:     `2px solid ${checked[item.id] ? '#4caf50' : '#ddd'}`,
                    background: checked[item.id] ? '#4caf50' : '#fff',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    flexShrink:0, transition:'all 0.15s',
                  }}>
                    {checked[item.id]
                      ? <svg width="20" height="16" viewBox="0 0 13 10" fill="none">
                          <path d="M1 5L4.5 8.5L12 1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      : <div style={{ width:18, height:18, borderRadius:4, border:'2px solid #ccc', background:'#f8f8f8' }}/>
                    }
                  </div>

                  {/* Text */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#1a2540', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      Payment by {item.submitter_name}
                    </div>
                    <div style={{ fontSize:11, color:'#777', marginTop:2 }}>
                      Date {fmtDate(item.payment_date)}
                      {item.project?.project_name ? ` · ${item.project.project_name}` : ''}
                    </div>
                  </div>

                  {/* Amount */}
                  <div style={{ fontSize:13, fontWeight:900, color:'#e65100', flexShrink:0 }}>
                    SAR {fmt(item.total_amount)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Confirmed history */}
        {!loading && confirmed.length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#4caf50', marginBottom:8, paddingLeft:2 }}>✓ Confirmed</div>
            <div style={{ background:'#1e1e1e', borderRadius:16, overflow:'hidden' }}>
              {confirmed.map((item, idx) => (
                <div key={item.id} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'12px 16px',
                  borderBottom: idx < confirmed.length - 1 ? '1px solid #2a2a2a' : 'none',
                }}>
                  <div style={{ fontSize:18 }}>✅</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#4caf50' }}>SAR {fmt(item.total_amount)} — Confirmed</div>
                    <div style={{ fontSize:11, color:'#666', marginTop:2 }}>
                      {fmtDate(item.payment_date)}{item.ack_at ? ` · ${fmtDate(item.ack_at)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      {/* ── END SCROLLABLE ─────────────────────────────────────────────── */}

      {/* ── PINNED BOTTOM: Confirm button ─────────────────────────────── */}
      {!loading && pending.length > 0 && (
        <div style={{
          flexShrink:  0,
          padding:     '12px 16px 28px',
          background:  '#111',
          borderTop:   '1px solid #1e1e1e',
        }}>
          <button
            onClick={handleConfirm}
            disabled={saving || checkedCount === 0}
            style={{
              display:      'block',
              width:        '100%',
              background:   checkedCount === 0
                ? '#2a2a2a'
                : 'linear-gradient(135deg, #2e7d32, #43a047)',
              color:        checkedCount === 0 ? '#555' : '#fff',
              border:       'none',
              borderRadius: 16,
              padding:      '17px',
              fontSize:     16,
              fontWeight:   900,
              cursor:       checkedCount === 0 ? 'default' : 'pointer',
              boxShadow:    checkedCount > 0 ? '0 4px 20px rgba(46,125,50,0.5)' : 'none',
              letterSpacing:0.4,
              transition:   'all 0.2s',
            }}>
            {saving ? 'Confirming…' : checkedCount === 0 ? 'Select payments to confirm' : '✓  confirm'}
          </button>
        </div>
      )}

    </div>
  )
}
