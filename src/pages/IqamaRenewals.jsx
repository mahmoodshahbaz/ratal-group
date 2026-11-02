import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PageBanner from '../components/PageBanner'
import FormShell  from '../components/FormShell'

const MC  = GROUP_COLORS.HR   // '#795338'
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0, 10)

// Hijri lunar month equivalents in Gregorian days
// (1 Hijri year = ~354 days, NOT 365 — drift ~11 days/year)
// These are approximations — PRO must confirm actual date from Absher.
const HIJRI_DAYS = { 3: 89, 6: 177, 9: 266, 12: 354 }

// Renewal fee is SAR 650/year — pro-rated per quarter (650 ÷ 4 = 162.5/quarter)
const RENEWAL_FEE = { 3: 162.5, 6: 325, 9: 487.5, 12: 650 }

function addHijriDays(dateStr, months) {
  if (!dateStr) return ''
  const days = HIJRI_DAYS[+months] || 354
  const d    = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Status flow ───────────────────────────────────────────────────────────────
const STATUS_FLOW = {
  PENDING:         { bg: '#f5f7fa', color: '#6b7c93',  next: 'SADAD_GENERATED', label: 'Mark Sadad Generated' },
  SADAD_GENERATED: { bg: '#e3f2fd', color: '#1565C0',  next: 'PAID',            label: 'Mark as Paid'         },
  PAID:            { bg: '#fff3e0', color: '#e65100',  next: 'IQAMAS_UPDATED',  label: 'Mark Iqamas Updated'  },
  IQAMAS_UPDATED:  { bg: '#e8f5e9', color: '#2e7d32',  next: null,              label: 'Completed'            },
  CANCELLED:       { bg: '#fce4ec', color: '#b71c1c',  next: null,              label: 'Cancelled'            },
}

const KPI_DEFS = [
  { key: 'total',           label: 'Total Batches',   g: ['#0d47a1', '#1565C0'], click: false },
  { key: 'PENDING',         label: 'Pending',          g: ['#4a148c', '#6a1b9a'], click: true  },
  { key: 'SADAD_GENERATED', label: 'Sadad Generated',  g: ['#bf360c', '#e65100'], click: true  },
  { key: 'PAID',            label: 'Paid / Updating',  g: ['#1b5e20', '#388e3c'], click: true  },
  { key: 'IQAMAS_UPDATED',  label: 'Completed',        g: ['#37474f', '#546e7a'], click: true  },
]

const EMPTY_BATCH = {
  sadad_number:           '',
  generated_by:           '',   // PRO who generated the Sadad from MOI/ABSHER
  sadad_total_amount:     '',   // ceiling for levy validation
  iqama_count:            1,    // drives auto-line generation
  default_duration_months: 12,  // pre-fills all lines — each line can override
  payment_date:           '',
  bank_ref:               '',
  notes:                  '',
}

const EMPTY_LINE = {
  employee_id:              '',
  employee_name:            '',
  iqama_number:             '',
  current_expiry_date:      '',
  new_expiry_date:          '',
  renewal_duration_months:  12,    // per-line — can differ across employees in same batch
  renewal_fee:              650,   // SAR 650/yr, pro-rated: 162.5 / 325 / 487.5 / 650
  levy_amount:              '',
  other_fees:               0,
  confirmation_status:      'PENDING',
}

// Company cost only — levy + renewal + other (does NOT include employee's family fee)
function lineTotal(l) {
  return (+(l.renewal_fee || 650)) + (+(l.levy_amount || 0)) + (+(l.other_fees || 0))
}

export default function IqamaRenewals({ entityId }) {
  const [batches,      setBatches]      = useState([])
  const [employees,    setEmployees]    = useState([])
  const [empIqamas,    setEmpIqamas]    = useState({})   // empId → { doc_id, doc_number, expiry_date }
  const [depCounts,    setDepCounts]    = useState({})   // empId → dep count
  const [busyEmployees,setBusyEmployees]= useState(new Set()) // empIds in active (non-complete) batches
  const [loading,      setLoading]      = useState(true)
  const [openBatch,    setOpenBatch]    = useState(null)

  // Form state
  const [showBanner,   setShowBanner]   = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [step,         setStep]         = useState(1)
  const [batchForm,    setBatchForm]    = useState(EMPTY_BATCH)
  const [lines,        setLines]        = useState([{ ...EMPTY_LINE }])
  const [saving,       setSaving]       = useState(false)

  // Status advance modal
  const [statusModal,  setStatusModal]  = useState(null)  // { batch, action }
  const [statusForm,   setStatusForm]   = useState({})
  const [iqamaLines,   setIqamaLines]   = useState([])

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [search,       setSearch]       = useState('')

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [
      { data: bData },
      { data: eData },
      { data: iData },
      { data: dData },
    ] = await Promise.all([
      supabase.from('iqama_renewals')
        .select('*, iqama_renewal_lines(*)')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('employees')
        .select('id, full_name_en, iqama_number, has_dependents')
        .eq('entity_id', entityId)
        .neq('is_active', false)
        .order('full_name_en')
        .limit(500),
      supabase.from('documents')
        .select('id, linked_id, doc_number, expiry_date')
        .eq('entity_id', entityId)
        .eq('category', 'IQAMA')
        .limit(500),
      supabase.from('employee_dependents')
        .select('employee_id')
        .eq('entity_id', entityId)
        .limit(2000),
    ])

    setBatches(bData || [])
    setEmployees(eData || [])

    // Iqama doc map
    const iMap = {}
    for (const d of (iData || [])) {
      if (d.linked_id) iMap[d.linked_id] = { doc_id: d.id, doc_number: d.doc_number, expiry_date: d.expiry_date }
    }
    setEmpIqamas(iMap)

    // Dependent count map: empId → count
    const dMap = {}
    for (const d of (dData || [])) {
      if (d.employee_id) dMap[d.employee_id] = (dMap[d.employee_id] || 0) + 1
    }
    setDepCounts(dMap)

    // Busy employees: those already in an active (not completed/cancelled) batch
    const busy = new Set()
    for (const b of (bData || [])) {
      if (!['IQAMAS_UPDATED', 'CANCELLED'].includes(b.status)) {
        for (const l of (b.iqama_renewal_lines || [])) {
          if (l.employee_id && !['IQAMA_UPDATED', 'CANCELLED'].includes(l.status)) {
            busy.add(l.employee_id)
          }
        }
      }
    }
    setBusyEmployees(busy)
    setLoading(false)
  }

  // ── KPI counts ─────────────────────────────────────────────────────────────
  const counts = batches.reduce((acc, b) => {
    acc.total++
    acc[b.status] = (acc[b.status] || 0) + 1
    return acc
  }, { total: 0 })

  const totalCompleted = batches
    .filter(b => b.status === 'IQAMAS_UPDATED')
    .reduce((s, b) => s + (b.total_amount || 0), 0)

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = batches.filter(b => {
    if (statusFilter && b.status !== statusFilter) return false
    if (search) {
      const q   = search.toLowerCase()
      const bls = b.iqama_renewal_lines || []
      if (
        !(b.sadad_number || '').toLowerCase().includes(q) &&
        !(b.generated_by || '').toLowerCase().includes(q) &&
        !bls.some(l =>
          (l.employee_name || '').toLowerCase().includes(q) ||
          (l.iqama_number  || '').toLowerCase().includes(q)
        )
      ) return false
    }
    return true
  })

  // ── Employee line helpers ──────────────────────────────────────────────────
  function selectEmployee(i, empId) {
    const emp        = employees.find(e => e.id === empId)
    const iqama      = empIqamas[empId] || {}
    const deps       = depCounts[empId] || 0
    const confStatus = !empId ? 'PENDING' : deps === 0 ? 'AUTO_CLEARED' : 'PENDING'
    // Use this line's own duration (not batch default) — PRO may have already changed it
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const suggestedExpiry = addHijriDays(iqama.expiry_date || '', +(l.renewal_duration_months || 12))
      return {
        ...l,
        employee_id:         empId,
        employee_name:       emp?.full_name_en       || '',
        iqama_number:        iqama.doc_number        || emp?.iqama_number || '',
        current_expiry_date: iqama.expiry_date       || '',
        new_expiry_date:     suggestedExpiry,          // hint — PRO confirms from Absher
        confirmation_status: confStatus,
      }
    }))
  }

  function setLine(i, key, val) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l))
  }

  // When duration changes on a line: recalculate expiry estimate AND pro-rate the renewal fee
  function changeDuration(i, months) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const newExpiry = l.current_expiry_date
        ? addHijriDays(l.current_expiry_date, +months)
        : l.new_expiry_date
      return {
        ...l,
        renewal_duration_months: +months,
        renewal_fee:             RENEWAL_FEE[+months] ?? 650,
        new_expiry_date:         newExpiry,
      }
    }))
  }

  // When moving to Step 2, auto-generate N lines based on iqama_count
  // Pre-fill each line's duration from the batch default
  function goToStep2() {
    const count   = Math.max(1, +(batchForm.iqama_count || 1))
    const defDur  = +(batchForm.default_duration_months || 12)
    setLines(prev => {
      const baseLine = { ...EMPTY_LINE, renewal_duration_months: defDur, renewal_fee: RENEWAL_FEE[defDur] ?? 650 }
      const allEmpty = prev.every(l => !l.employee_id)
      if (allEmpty) {
        return Array.from({ length: count }, () => ({ ...baseLine }))
      }
      if (prev.length < count) {
        return [...prev, ...Array.from({ length: count - prev.length }, () => ({ ...baseLine }))]
      }
      return prev
    })
    setStep(2)
  }

  // Levy total for validation
  const totalLevy = lines.reduce((s, l) => s + +(l.levy_amount || 0), 0)
  const levyExceeded = +batchForm.sadad_total_amount > 0 && totalLevy > +batchForm.sadad_total_amount
  const grandTotal   = lines.reduce((s, l) => s + lineTotal(l), 0)

  // ── Save new batch ─────────────────────────────────────────────────────────
  async function saveBatch() {
    const valid = lines.filter(l => l.employee_id)
    if (valid.length === 0) { alert('Add at least one employee'); return }
    if (levyExceeded) { alert('Levy total exceeds the Sadad declared amount. Please correct before saving.'); return }
    setSaving(true)

    const { data: batch, error } = await supabase
      .from('iqama_renewals')
      .insert({
        entity_id:          entityId,
        sadad_number:       batchForm.sadad_number       || null,
        generated_by:       batchForm.generated_by       || null,
        sadad_total_amount:       +(batchForm.sadad_total_amount       || 0),
        iqama_count:              +(batchForm.iqama_count              || valid.length),
        renewal_duration_months:  +(batchForm.default_duration_months  || 12),  // batch-level default snapshot
        payment_date:        batchForm.payment_date         || null,
        bank_ref:           batchForm.bank_ref            || null,
        total_amount:       grandTotal,
        status:             'PENDING',
        notes:              batchForm.notes || null,
      })
      .select()
      .single()

    if (error) { alert(error.message); setSaving(false); return }

    await supabase.from('iqama_renewal_lines').insert(
      valid.map(l => ({
        batch_id:                 batch.id,
        entity_id:                entityId,
        employee_id:              l.employee_id,
        employee_name:            l.employee_name,
        iqama_number:             l.iqama_number             || null,
        current_expiry_date:      l.current_expiry_date       || null,
        new_expiry_date:          l.new_expiry_date            || null,
        renewal_duration_months:  +(l.renewal_duration_months  || 12),
        renewal_fee:              +(l.renewal_fee               || 650),
        levy_amount:              +(l.levy_amount              || 0),
        dependent_count_above_18: depCounts[l.employee_id]   || 0,
        other_fees:               +(l.other_fees               || 0),
        confirmation_status:      l.confirmation_status       || 'PENDING',
        status:                   'PENDING',
      }))
    )

    setSaving(false)
    setShowForm(false)
    setStep(1)
    setBatchForm(EMPTY_BATCH)
    setLines([{ ...EMPTY_LINE }])
    load()
  }

  // ── Status advance modal ───────────────────────────────────────────────────
  function openStatusModal(batch) {
    const action =
      batch.status === 'PENDING'         ? 'sadad'  :
      batch.status === 'SADAD_GENERATED' ? 'paid'   :
      batch.status === 'PAID'            ? 'iqamas' : null
    if (!action) return
    setStatusModal({ batch, action })
    setStatusForm({
      sadad_number: batch.sadad_number || '',
      payment_date: batch.payment_date || TODAY,
      bank_ref:     batch.bank_ref     || '',
    })
    if (action === 'iqamas') {
      setIqamaLines(
        (batch.iqama_renewal_lines || []).map(l => ({ ...l, new_expiry_date: l.new_expiry_date || '' }))
      )
    }
  }

  async function advanceStatus() {
    const { batch, action } = statusModal
    setSaving(true)

    if (action === 'sadad') {
      const sn = (statusForm.sadad_number || '').replace(/\D/g, '')
      if (sn.length !== 12) { alert('Sadad Number must be exactly 12 digits.'); setSaving(false); return }
      await supabase.from('iqama_renewals').update({
        status:       'SADAD_GENERATED',
        sadad_number: sn,
      }).eq('id', batch.id)
    }

    if (action === 'paid') {
      await supabase.from('iqama_renewals').update({
        status:       'PAID',
        payment_date: statusForm.payment_date || null,
        bank_ref:     statusForm.bank_ref     || null,
      }).eq('id', batch.id)
    }

    if (action === 'iqamas') {
      for (const l of iqamaLines) {
        if (!l.new_expiry_date) continue

        await supabase.from('iqama_renewal_lines').update({
          new_expiry_date: l.new_expiry_date,
          status:          'IQAMA_UPDATED',
        }).eq('id', l.id)

        // Update Iqama document and write renewal history
        const iqDoc = empIqamas[l.employee_id]
        if (iqDoc) {
          await supabase.from('document_renewals').insert({
            document_id:          iqDoc.doc_id,
            entity_id:            entityId,
            previous_doc_number:  iqDoc.doc_number,
            previous_expiry_date: iqDoc.expiry_date,
            new_doc_number:       l.iqama_number || iqDoc.doc_number,
            new_expiry_date:      l.new_expiry_date,
            renewal_fee:          +(l.renewal_fee  || 650),
            levy_amount:          +(l.levy_amount  || 0),
            // family_fee_annual is employee's own cost — recorded for transparency
            dependent_fee:        (+(l.dependent_count_above_18 || 0)) * 4800,
            other_fees:           +(l.other_fees   || 0),
            renewed_by:           batch.generated_by || null,
            notes:                `Sadad batch ${batch.sadad_number ? '#' + batch.sadad_number : batch.id.slice(0, 8)}`,
          })
          await supabase.from('documents').update({
            expiry_date:    l.new_expiry_date,
            renewal_status: 'ACTIVE',
          }).eq('id', iqDoc.doc_id)
        }
      }
      await supabase.from('iqama_renewals').update({ status: 'IQAMAS_UPDATED' }).eq('id', batch.id)
    }

    setSaving(false)
    setStatusModal(null)
    load()
  }

  async function cancelBatch(id) {
    if (!window.confirm('Cancel this batch? This cannot be undone.')) return
    await supabase.from('iqama_renewals').update({ status: 'CANCELLED' }).eq('id', id)
    load()
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inp = { padding: '7px 10px', borderRadius: 4, border: '1px solid #dde3ec', fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }
  const btn = (bg = MC, c = '#fff') => ({ background: bg, color: c, border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' })
  const lbl = { display: 'block', fontSize: 11, color: '#6b7c93', fontWeight: 700, marginBottom: 4 }
  const TH  = { padding: '7px 10px', background: MC, color: '#fff', fontWeight: 700, fontSize: 11, textAlign: 'left', whiteSpace: 'nowrap' }
  const TD  = { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #f0f4f8', verticalAlign: 'middle', whiteSpace: 'nowrap' }

  // Confirmation status display
  function ConfBadge({ status, empId }) {
    if (!empId) return <div style={{ ...inp, background: '#f5f7fa', color: '#aab2bd' }}>—</div>
    const deps = depCounts[empId] || 0
    const familyFee = deps * 4800
    if (status === 'AUTO_CLEARED')
      return <div style={{ ...inp, background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, fontSize: 11 }}>✓ No Dependents</div>
    if (status === 'CONFIRMED')
      return <div style={{ ...inp, background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, fontSize: 11 }}>✓ Confirmed</div>
    if (status === 'FLAGGED')
      return <div style={{ ...inp, background: '#ffebee', color: '#c62828', fontWeight: 700, fontSize: 11 }}>⚠ Issue Flagged</div>
    // PENDING
    return (
      <div style={{ ...inp, background: '#fff8e1', color: '#7c4a00', fontSize: 10, lineHeight: 1.4 }}>
        ⏳ Pending<br />
        <span style={{ color: '#6b7c93' }}>{deps} dep · SAR {familyFee.toLocaleString()}/yr</span>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Iqama renewal batches — Sadad tracking, levy validation, automatic document updates
        </div>
        <button style={btn()} onClick={() => { setBatchForm(EMPTY_BATCH); setLines([{ ...EMPTY_LINE }]); setShowBanner(true) }}>
          + New Renewal Batch
        </button>
      </div>

      {/* ── Sticky zone ────────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#f4f6fa', paddingBottom: 10, paddingTop: 4 }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 10 }}>
          {KPI_DEFS.map(k => {
            const val    = k.key === 'total' ? counts.total : (counts[k.key] || 0)
            const active = statusFilter === k.key
            return (
              <div key={k.key}
                onClick={() => k.click && setStatusFilter(active ? '' : k.key)}
                style={{
                  background: `linear-gradient(135deg, ${k.g[0]}, ${k.g[1]})`,
                  borderRadius: 8, padding: '10px 14px', color: '#fff',
                  cursor: k.click ? 'pointer' : 'default',
                  boxShadow: active ? `0 0 0 3px #fff, 0 0 0 5px ${k.g[1]}` : '0 2px 8px rgba(0,0,0,0.18)',
                  transform: active ? 'scale(1.04)' : 'scale(1)', transition: 'all 0.15s',
                }}>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 10, opacity: 0.85, marginTop: 3 }}>{k.label}</div>
              </div>
            )
          })}
        </div>

        {/* Filter bar */}
        <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexWrap: 'wrap' }}>
          <div style={{ padding: '6px 14px', background: '#fff8e1', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#7c4a00', whiteSpace: 'nowrap' }}>
            ✅ SAR {totalCompleted.toLocaleString()} completed
          </div>
          <input style={{ ...inp, flex: 1, minWidth: 200 }}
            placeholder="Search Sadad #, PRO name, employee, Iqama #…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...inp, minWidth: 170 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {['PENDING','SADAD_GENERATED','PAID','IQAMAS_UPDATED','CANCELLED'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {(statusFilter || search) && (
            <button style={btn('#aab2bd')} onClick={() => { setStatusFilter(''); setSearch('') }}>✕ Clear</button>
          )}
          <span style={{ fontSize: 11, color: '#6b7c93', whiteSpace: 'nowrap' }}>{filtered.length} batch{filtered.length !== 1 ? 'es' : ''}</span>
        </div>
      </div>

      {/* ── Batch list ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7c93' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aab2bd', fontSize: 13 }}>
          No batches found — create your first Iqama renewal batch above.
        </div>
      ) : (
        filtered.map(batch => {
          const sf     = STATUS_FLOW[batch.status] || STATUS_FLOW.PENDING
          const bLines = batch.iqama_renewal_lines || []
          const isOpen = openBatch === batch.id
          const bTotal = bLines.reduce((s, l) => s + (l.line_total || lineTotal(l)), 0)
          const done   = bLines.filter(l => l.status === 'IQAMA_UPDATED').length
          const pendingConf = bLines.filter(l => l.confirmation_status === 'PENDING').length

          return (
            <div key={batch.id} style={{ background: '#fff', borderRadius: 10, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden', border: '1px solid #e8edf2' }}>
              {/* Batch summary row */}
              <div style={{ display: 'flex', gap: 12, padding: '14px 18px', alignItems: 'center', background: '#fafbfc', borderBottom: isOpen ? '1px solid #eef1f6' : 'none', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  {/* Line 1: Sadad number + declared amount */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#1a2e3d', fontFamily: 'monospace', letterSpacing: 0.5 }}>
                      {batch.sadad_number ? `Sadad # ${batch.sadad_number}` : <span style={{ color: '#e65100' }}>⚠ No Sadad #</span>}
                    </span>
                    {batch.sadad_total_amount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7c93', background: '#f0f4f8', borderRadius: 4, padding: '2px 8px' }}>
                        Declared: SAR {(+batch.sadad_total_amount).toLocaleString()}
                      </span>
                    )}
                    {batch.status === 'IQAMAS_UPDATED' && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2e7d32' }}>{done}/{bLines.length} Iqamas updated</span>
                    )}
                    {pendingConf > 0 && batch.status === 'PENDING' && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#e65100' }}>⏳ {pendingConf} dep. confirmation{pendingConf > 1 ? 's' : ''} pending</span>
                    )}
                  </div>
                  {/* Line 2: meta details */}
                  <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#6b7c93' }}>👥 {bLines.length} employee{bLines.length !== 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 11, color: MC, fontWeight: 700 }}>SAR {bTotal.toLocaleString()} company cost</span>
                    {batch.generated_by && <span style={{ fontSize: 11, color: '#6b7c93' }}>PRO: <strong style={{ color: '#1a2e3d' }}>{batch.generated_by}</strong></span>}
                    {batch.payment_date && <span style={{ fontSize: 11, color: '#6b7c93' }}>Paid: <strong style={{ color: '#1a2e3d' }}>{fmt(batch.payment_date)}</strong></span>}
                    {batch.bank_ref     && <span style={{ fontSize: 11, color: '#6b7c93' }}>Ref: <strong style={{ color: '#1a2e3d' }}>{batch.bank_ref}</strong></span>}
                    <span style={{ fontSize: 11, color: '#aab2bd' }}>Created {fmt(batch.created_at?.slice(0, 10))}</span>
                  </div>
                </div>

                <span style={{ padding: '3px 12px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: sf.bg, color: sf.color, whiteSpace: 'nowrap' }}>
                  {batch.status.replace(/_/g, ' ')}
                </span>

                {sf.next && (
                  <button style={{ ...btn(), padding: '5px 12px', fontSize: 11, whiteSpace: 'nowrap' }}
                    onClick={() => openStatusModal(batch)}>
                    {sf.label} →
                  </button>
                )}

                {!['IQAMAS_UPDATED', 'CANCELLED'].includes(batch.status) && (
                  <button style={{ ...btn('#fff5f5', '#b71c1c'), padding: '5px 10px', fontSize: 11, border: '1px solid #ffcdd2' }}
                    onClick={() => cancelBatch(batch.id)}>
                    Cancel
                  </button>
                )}

                <button style={{ ...btn('#f0f4f8', '#1a2e3d'), padding: '5px 10px', fontSize: 11 }}
                  onClick={() => setOpenBatch(isOpen ? null : batch.id)}>
                  {isOpen ? '▲ Hide' : '▼ Lines'}
                </button>
              </div>

              {/* Expanded: employee lines */}
              {isOpen && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 780 }}>
                    <thead>
                      <tr>
                        {['Employee', 'Iqama #', 'Current Expiry', 'New Expiry', 'Levy', 'Renewal', 'Other', 'Company Total', 'Dep Confirmation', 'Status'].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bLines.map((l, i) => {
                        const lt    = l.line_total || lineTotal(l)
                        const deps  = l.dependent_count_above_18 || 0
                        const famFee = deps * 4800
                        return (
                          <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                            <td style={{ ...TD, fontWeight: 700 }}>{l.employee_name || '—'}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{l.iqama_number || '—'}</td>
                            <td style={{ ...TD, color: '#6b7c93' }}>{fmt(l.current_expiry_date)}</td>
                            <td style={{ ...TD, fontWeight: l.new_expiry_date ? 700 : 400, color: l.new_expiry_date ? '#2e7d32' : '#aab2bd' }}>
                              {fmt(l.new_expiry_date)}
                            </td>
                            <td style={TD}>{l.levy_amount ? `SAR ${(+l.levy_amount).toLocaleString()}` : '—'}</td>
                            <td style={TD}>SAR {(l.renewal_fee || 650).toLocaleString()}</td>
                            <td style={TD}>{l.other_fees > 0 ? `SAR ${(+l.other_fees).toLocaleString()}` : '—'}</td>
                            <td style={{ ...TD, fontWeight: 800, color: MC }}>SAR {lt.toLocaleString()}</td>
                            <td style={TD}>
                              {l.confirmation_status === 'AUTO_CLEARED'
                                ? <span style={{ color: '#2e7d32', fontWeight: 700, fontSize: 11 }}>✓ No Deps</span>
                                : l.confirmation_status === 'CONFIRMED'
                                  ? <span style={{ color: '#2e7d32', fontWeight: 700, fontSize: 11 }}>✓ Confirmed</span>
                                  : l.confirmation_status === 'FLAGGED'
                                    ? <span style={{ color: '#c62828', fontWeight: 700, fontSize: 11 }}>⚠ Issue</span>
                                    : deps > 0
                                      ? <span style={{ color: '#7c4a00', fontSize: 11 }}>⏳ {deps} dep · SAR {famFee.toLocaleString()}/yr</span>
                                      : <span style={{ color: '#aab2bd', fontSize: 11 }}>—</span>
                              }
                            </td>
                            <td style={TD}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: l.status === 'IQAMA_UPDATED' ? '#2e7d32' : l.status === 'CANCELLED' ? '#b71c1c' : '#e65100' }}>
                                {(l.status || 'PENDING').replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ background: '#f7f2ed' }}>
                        <td colSpan={7} style={{ ...TD, fontWeight: 800, textAlign: 'right', color: MC, fontSize: 11, borderBottom: 'none' }}>BATCH COMPANY TOTAL</td>
                        <td style={{ ...TD, fontWeight: 800, fontSize: 13, color: MC, borderBottom: 'none' }}>SAR {bTotal.toLocaleString()}</td>
                        <td colSpan={2} style={{ ...TD, borderBottom: 'none' }} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* ── PageBanner ────────────────────────────────────────────────────── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setStep(1); setShowForm(true) }}
        chapterName="HR"
        formTitle={['New', 'Iqama', 'Renewal']}
        heading="Create a new Iqama renewal batch"
        iconLabel="Iqama"
        workflowSteps={['Batch Details', 'Add Employees']}
        description="Enter the batch details and how many Iqamas to renew. Employees already in an active batch are locked. Levy totals are validated against the Sadad declared amount."
      />

      {/* ── FormShell wizard ──────────────────────────────────────────────── */}
      <FormShell
        isOpen={showForm}
        onClose={() => { setShowForm(false); setStep(1) }}
        chapterName="HR"
        title={['New', 'Iqama', 'Renewal']}
        steps={['Batch Details', 'Add Employees']}
        currentStep={step}
        onBack={() => setStep(1)}
        backLabel="Back"
        onNext={step === 1 ? goToStep2 : saveBatch}
        nextLabel={step === 1 ? 'Next: Add Employees' : (saving ? 'Saving…' : 'Create Batch')}
        nextDisabled={saving || (step === 2 && levyExceeded)}
      >
        {/* ── Step 1: Batch Details ── */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Number of Iqamas to Renew *</label>
              <input type="number" min="1" style={{ ...inp, width: '100%' }} placeholder="e.g. 3"
                value={batchForm.iqama_count}
                onChange={e => setBatchForm(p => ({ ...p, iqama_count: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Default Duration (pre-fills all lines)</label>
              <select style={{ ...inp, width: '100%' }}
                value={batchForm.default_duration_months}
                onChange={e => setBatchForm(p => ({ ...p, default_duration_months: e.target.value }))}>
                <option value={3}>3 Months (~89 days)</option>
                <option value={6}>6 Months (~177 days)</option>
                <option value={9}>9 Months (~266 days)</option>
                <option value={12}>12 Months (~354 days)</option>
              </select>
              <div style={{ fontSize: 10, color: '#6b7c93', marginTop: 3 }}>Each employee can have a different duration in Step 2</div>
            </div>
            <div>
              <label style={lbl}>Sadad Total Amount (SAR)</label>
              <input type="number" style={{ ...inp, width: '100%' }} placeholder="Declared amount on Sadad bill"
                value={batchForm.sadad_total_amount}
                onChange={e => setBatchForm(p => ({ ...p, sadad_total_amount: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Sadad Number</label>
              <input style={{ ...inp, width: '100%' }} placeholder="From MOI / ABSHER (can add later)"
                value={batchForm.sadad_number}
                onChange={e => setBatchForm(p => ({ ...p, sadad_number: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Generated By (PRO)</label>
              <input style={{ ...inp, width: '100%' }} placeholder="PRO name who generated the Sadad"
                value={batchForm.generated_by}
                onChange={e => setBatchForm(p => ({ ...p, generated_by: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Payment Date</label>
              <input type="date" style={{ ...inp, width: '100%' }}
                value={batchForm.payment_date}
                onChange={e => setBatchForm(p => ({ ...p, payment_date: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Bank Reference</label>
              <input style={{ ...inp, width: '100%' }} placeholder="Bank transaction reference"
                value={batchForm.bank_ref}
                onChange={e => setBatchForm(p => ({ ...p, bank_ref: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / 3' }}>
              <label style={lbl}>Notes</label>
              <input style={{ ...inp, width: '100%' }} placeholder="Any remarks…"
                value={batchForm.notes}
                onChange={e => setBatchForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
        )}

        {/* ── Step 2: Add Employees ── */}
        {step === 2 && (
          <div>
            {/* Levy validation banner */}
            {+batchForm.sadad_total_amount > 0 && (
              <div style={{
                borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, fontWeight: 700,
                ...(levyExceeded
                  ? { background: '#ffebee', border: '1px solid #ef9a9a', color: '#c62828' }
                  : { background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32' })
              }}>
                {levyExceeded
                  ? `⚠ Levy total SAR ${totalLevy.toLocaleString()} exceeds Sadad amount SAR ${(+batchForm.sadad_total_amount).toLocaleString()} — overage: SAR ${(totalLevy - +batchForm.sadad_total_amount).toLocaleString()}`
                  : `✓ Levy total SAR ${totalLevy.toLocaleString()} — within Sadad SAR ${(+batchForm.sadad_total_amount).toLocaleString()} (remaining: SAR ${(+batchForm.sadad_total_amount - totalLevy).toLocaleString()})`
                }
              </div>
            )}

            {/* Employee cards — 2-row layout */}
            {lines.map((l, i) => {
              const deps       = depCounts[l.employee_id] || 0
              const familyFee  = deps * 4800
              const compTotal  = lineTotal(l)
              const isBusy     = l.employee_id && busyEmployees.has(l.employee_id)

              return (
                <div key={i} style={{ border: `1px solid ${isBusy ? '#ffcdd2' : '#e8edf2'}`, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                  {/* Row 1: employee identity */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr 0.9fr 0.85fr 1fr auto', gap: 10, padding: '10px 14px', background: '#fafbfc', alignItems: 'end', borderBottom: '1px solid #f0f4f8' }}>
                    <div>
                      <label style={lbl}>Employee {i + 1}</label>
                      <select style={{ ...inp, width: '100%' }} value={l.employee_id} onChange={e => selectEmployee(i, e.target.value)}>
                        <option value="">— Select Employee —</option>
                        {employees.map(e => {
                          const busy = busyEmployees.has(e.id) && e.id !== l.employee_id
                          return (
                            <option key={e.id} value={e.id} disabled={busy}>
                              {busy ? `[Active Batch] ${e.full_name_en}` : e.full_name_en}
                            </option>
                          )
                        })}
                      </select>
                      {isBusy && <div style={{ fontSize: 10, color: '#c62828', marginTop: 3 }}>⚠ This employee is already in an active batch</div>}
                    </div>
                    <div>
                      <label style={lbl}>Iqama #</label>
                      <input style={{ ...inp, width: '100%', fontFamily: 'monospace', background: '#f5f7fa' }}
                        value={l.iqama_number} readOnly placeholder="Auto-filled" />
                    </div>
                    <div>
                      <label style={lbl}>Current Expiry</label>
                      <input style={{ ...inp, width: '100%', background: '#f5f7fa', color: '#6b7c93' }}
                        value={l.current_expiry_date ? fmt(l.current_expiry_date) : ''} readOnly placeholder="—" />
                    </div>
                    <div>
                      <label style={lbl}>Duration</label>
                      <select style={{ ...inp, width: '100%' }}
                        value={l.renewal_duration_months}
                        onChange={e => changeDuration(i, e.target.value)}>
                        <option value={3}>3 mo</option>
                        <option value={6}>6 mo</option>
                        <option value={9}>9 mo</option>
                        <option value={12}>12 mo</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>New Expiry <span style={{ color: '#e65100', fontWeight: 400 }}>(confirm from Absher)</span></label>
                      <input type="date" style={{ ...inp, width: '100%', border: '1px solid #f0a500' }}
                        value={l.new_expiry_date}
                        onChange={e => setLine(i, 'new_expiry_date', e.target.value)} />
                      {l.new_expiry_date && (
                        <div style={{ fontSize: 10, color: '#6b7c93', marginTop: 2 }}>
                          ~{l.renewal_duration_months}mo Hijri estimate — overwrite with actual Absher date
                        </div>
                      )}
                    </div>
                    <div style={{ paddingBottom: 4, alignSelf: 'end' }}>
                      <button onClick={() => setLines(p => p.filter((_, xi) => xi !== i))}
                        style={{ background: 'none', border: 'none', color: '#b71c1c', cursor: 'pointer', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>✕</button>
                    </div>
                  </div>

                  {/* Row 2: fees + dep confirmation */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr 1fr', gap: 10, padding: '10px 14px', alignItems: 'end' }}>
                    <div>
                      <label style={lbl}>Levy (SAR)</label>
                      <input type="number" style={{ ...inp, width: '100%' }}
                        value={l.levy_amount}
                        onChange={e => setLine(i, 'levy_amount', e.target.value)}
                        placeholder="8500 or 9700" />
                    </div>
                    <div>
                      <label style={lbl}>Renewal Fee</label>
                      <div style={{ ...inp, background: '#f5f7fa', color: '#1a2e3d', fontWeight: 700, lineHeight: '20px' }}>
                        SAR {(l.renewal_fee || RENEWAL_FEE[l.renewal_duration_months] || 650).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7c93', marginTop: 2 }}>650/yr ÷ {12 / (l.renewal_duration_months || 12)} qtrs</div>
                    </div>
                    <div>
                      <label style={lbl}>Other Fees</label>
                      <input type="number" style={{ ...inp, width: '100%' }}
                        value={l.other_fees}
                        onChange={e => setLine(i, 'other_fees', e.target.value)}
                        placeholder="0" />
                    </div>
                    <div>
                      <label style={lbl}>Dep. Confirmation</label>
                      <ConfBadge status={l.confirmation_status} empId={l.employee_id} />
                    </div>
                    <div>
                      <label style={lbl}>Company Total</label>
                      <div style={{ ...inp, background: '#f7f2ed', color: MC, fontWeight: 800, lineHeight: '20px' }}>
                        SAR {compTotal.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Grand total + Add button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
              <button style={{ ...btn('#f0f4f8', MC), border: `1px solid ${MC}` }}
                onClick={() => setLines(p => [...p, { ...EMPTY_LINE }])}>
                + Add Employee
              </button>
              <div style={{ fontSize: 13, fontWeight: 800, color: MC }}>
                Grand Company Total: SAR {grandTotal.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </FormShell>

      {/* ══════════════════════════════════════════════════════════════════════
          STATUS ADVANCE MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {statusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: statusModal.action === 'iqamas' ? 660 : 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Poppins,sans-serif' }}>
            <div style={{ background: MC, color: '#fff', padding: '14px 20px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {statusModal.action === 'sadad'  ? 'Enter Sadad Reference Number' :
                 statusModal.action === 'paid'   ? 'Confirm Payment Details'       :
                                                   'Enter New Iqama Expiry Dates'}
              </div>
              <button onClick={() => setStatusModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, width: 28, height: 28, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ padding: 20 }}>
              {statusModal.action === 'sadad' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#6b7c93', marginBottom: 12 }}>
                    Enter the Sadad bill reference number once generated from MOI / ABSHER. Must be exactly 12 digits.
                  </div>
                  <label style={lbl}>Sadad Reference Number * <span style={{ color: '#e65100' }}>(12 digits)</span></label>
                  <input
                    style={{ ...inp, width: '100%', fontFamily: 'monospace', fontSize: 15, letterSpacing: 2,
                      border: `1px solid ${(statusForm.sadad_number || '').replace(/\D/g,'').length === 12 ? '#4caf50' : '#e65100'}` }}
                    placeholder="000000000000"
                    maxLength={12}
                    inputMode="numeric"
                    value={statusForm.sadad_number || ''}
                    onChange={e => setStatusForm(p => ({ ...p, sadad_number: e.target.value.replace(/\D/g, '') }))} />
                  <div style={{ fontSize: 11, marginTop: 4,
                    color: (statusForm.sadad_number || '').length === 12 ? '#2e7d32' : '#e65100' }}>
                    {(statusForm.sadad_number || '').length} / 12 digits
                    {(statusForm.sadad_number || '').length === 12 && ' ✓'}
                  </div>
                </div>
              )}

              {statusModal.action === 'paid' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>Payment Date *</label>
                    <input type="date" style={{ ...inp, width: '100%' }}
                      value={statusForm.payment_date || TODAY}
                      onChange={e => setStatusForm(p => ({ ...p, payment_date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Bank Reference</label>
                    <input style={{ ...inp, width: '100%' }} placeholder="Bank transaction reference"
                      value={statusForm.bank_ref || ''}
                      onChange={e => setStatusForm(p => ({ ...p, bank_ref: e.target.value }))} />
                  </div>
                </div>
              )}

              {statusModal.action === 'iqamas' && (
                <div>
                  <div style={{ fontSize: 12, color: '#6b7c93', marginBottom: 12 }}>
                    Enter the new Iqama expiry date for each employee. The system will update their document in Compliance Alerts and write a renewal history entry.
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
                    <thead>
                      <tr>
                        {['Employee', 'Iqama #', 'Current Expiry', 'New Expiry *'].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {iqamaLines.map((l, i) => (
                        <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                          <td style={{ ...TD, fontWeight: 700 }}>{l.employee_name}</td>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{l.iqama_number || '—'}</td>
                          <td style={{ ...TD, color: '#6b7c93' }}>{fmt(l.current_expiry_date)}</td>
                          <td style={TD}>
                            <input type="date"
                              style={{ ...inp, width: '100%', border: !l.new_expiry_date ? '1px solid #c62828' : '1px solid #dde3ec' }}
                              value={l.new_expiry_date || ''}
                              onChange={e => setIqamaLines(prev => prev.map((x, xi) => xi === i ? { ...x, new_expiry_date: e.target.value } : x))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ background: '#fff8e1', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#7c4a00', marginBottom: 16 }}>
                    ⚠️ This updates each employee's Iqama expiry in Document Valet and writes a renewal log. Cannot be undone.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button style={btn('#aab2bd')} onClick={() => setStatusModal(null)}>Cancel</button>
                <button
                  style={{ ...btn(), opacity: (saving || (statusModal.action === 'sadad' && (statusForm.sadad_number || '').length !== 12)) ? 0.5 : 1 }}
                  disabled={saving || (statusModal.action === 'sadad' && (statusForm.sadad_number || '').length !== 12)}
                  onClick={advanceStatus}>
                  {saving ? 'Saving…' :
                   statusModal.action === 'sadad'  ? 'Confirm Sadad Number'          :
                   statusModal.action === 'paid'   ? 'Confirm Payment'               :
                                                     'Update All Iqamas & Complete Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
