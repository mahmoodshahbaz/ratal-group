import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import PageBanner from '../components/PageBanner'
import FormShell  from '../components/FormShell'

const MC  = GROUP_COLORS.HR   // '#795338'
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0, 10)

// ── Coverage classes ──────────────────────────────────────────────────────────
const CLASSES = ['A', 'B', 'C', 'D', 'E']
const CLASS_LABELS = { A: 'A — Premium', B: 'B — Enhanced', C: 'C — Standard', D: 'D — Basic', E: 'E — Minimum' }

// ── Transport modes ───────────────────────────────────────────────────────────
const TRANSPORT_MODES = ['SEA', 'AIR', 'LAND', 'MULTIMODAL']
const CARGO_CATS = ['EQUIPMENT', 'MATERIALS', 'GOODS', 'DOCUMENTS', 'OTHER']

// ── KPI gradients per tab ────────────────────────────────────────────────────
const TAB_COLOR = {
  HEALTH:   '#2e5fa3',
  VEHICLE:  '#7c4a00',
  SHIPMENT: '#1b6e4f',
}

// ── Empty forms ───────────────────────────────────────────────────────────────
const EMPTY_POLICY = {
  policy_type: 'HEALTH', insurer_name: '', master_policy_number: '',
  broker_name: '', inception_date: '', expiry_date: '',
  total_premium: '', currency: 'SAR', notes: '',
}

const EMPTY_MEMBER = {
  employee_id: '', coverage_class: 'B',
  individual_policy_number: '',
}

// ── SheetJS loader (CDN, loaded once) ────────────────────────────────────────
let _xlsxLoaded = false
function loadXLSX() {
  if (_xlsxLoaded || window.XLSX) { _xlsxLoaded = true; return Promise.resolve() }
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload  = () => { _xlsxLoaded = true; res() }
    s.onerror = rej
    document.head.appendChild(s)
  })
}

// ── Style helpers for SheetJS ────────────────────────────────────────────────
const XL_HEADER = (bgHex) => ({
  font:    { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Arial' },
  fill:    { fgColor: { rgb: bgHex.replace('#','') } },
  border:  { bottom: { style: 'thin', color: { rgb: 'CCCCCC' } } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
})
const XL_CELL = {
  font:      { sz: 10, name: 'Arial' },
  alignment: { vertical: 'center' },
}
const XL_TOTAL = {
  font:      { bold: true, sz: 10, name: 'Arial' },
  fill:      { fgColor: { rgb: 'F5F0E8' } },
  alignment: { vertical: 'center' },
}

function applyStyles(ws, headers, data, headerBg) {
  const XLSX = window.XLSX
  // Header row
  headers.forEach((h, ci) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: ci })
    if (!ws[addr]) ws[addr] = { v: h, t: 's' }
    ws[addr].s = XL_HEADER(headerBg)
  })
  // Data rows
  for (let ri = 1; ri <= data.length; ri++) {
    headers.forEach((h, ci) => {
      const addr = XLSX.utils.encode_cell({ r: ri, c: ci })
      if (ws[addr]) ws[addr].s = XL_CELL
    })
  }
  // Column widths
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }))
  ws['!rows'] = [{ hpt: 28 }] // header row height
}

// ── Master export function ────────────────────────────────────────────────────
async function exportPolicyXLSX(policy, tabType) {
  await loadXLSX()
  const XLSX   = window.XLSX
  const wb     = XLSX.utils.book_new()
  const bgHex  = TAB_COLOR[tabType] || '#2e5fa3'
  const dateStr = new Date().toLocaleDateString('en-GB')

  // ── Cover sheet ──────────────────────────────────────────────────────────────
  const coverRows = [
    ['ACCSYS Insurance Export', '', '', ''],
    ['Generated:', dateStr, '', ''],
    ['Policy Type:', tabType, '', ''],
    ['Insurer:', policy.insurer_name, '', ''],
    ['Master Policy #:', policy.master_policy_number || '—', '', ''],
    ['Broker:', policy.broker_name || '—', '', ''],
    ['Inception Date:', policy.inception_date || '—', '', ''],
    ['Expiry Date:', policy.expiry_date || '—', '', ''],
    ['Total Premium (SAR):', policy.total_premium || 0, '', ''],
    ['Status:', policy.status, '', ''],
  ]
  const wsCover = XLSX.utils.aoa_to_sheet(coverRows)
  wsCover['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 10 }, { wch: 10 }]
  if (wsCover['A1']) wsCover['A1'].s = { font: { bold: true, sz: 14, name: 'Arial', color: { rgb: bgHex.replace('#','') } } }
  XLSX.utils.book_append_sheet(wb, wsCover, 'Summary')

  if (tabType === 'HEALTH') {
    const members = policy.insurance_members || []
    const headers = ['#', 'Type', 'Name', 'Iqama / ID #', 'Class', 'Individual Policy #', 'Active']
    const rows = members.map((m, i) => {
      const nm  = m.member_type === 'EMPLOYEE'
        ? (m.employees?.full_name_en || '')
        : (m.employee_dependents?.full_name || '')
      const iq  = m.member_type === 'EMPLOYEE'
        ? (m.employees?.iqama_number || '')
        : (m.employee_dependents?.id_number || '')
      return [i+1, m.member_type, nm, iq, m.coverage_class || '', m.individual_policy_number || '', m.is_active ? 'Yes' : 'No']
    })
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    applyStyles(ws, headers, rows, bgHex)
    ws['!cols'] = [{ wch:5 },{ wch:12 },{ wch:28 },{ wch:16 },{ wch:8 },{ wch:22 },{ wch:8 }]
    // Totals row
    const totalRow = members.length + 1
    XLSX.utils.sheet_add_aoa(ws, [[
      '', 'TOTAL', `${members.filter(m=>m.member_type==='EMPLOYEE').length} emp  /  ${members.filter(m=>m.member_type==='DEPENDENT').length} dep`,
      '', '', '', members.filter(m=>m.is_active).length + ' active'
    ]], { origin: totalRow })
    const tr = ws[XLSX.utils.encode_cell({ r: totalRow, c: 1 })]
    if (tr) tr.s = XL_TOTAL
    XLSX.utils.book_append_sheet(wb, ws, 'Health Members')
  }

  if (tabType === 'VEHICLE') {
    const vehs = policy.insurance_vehicles || []
    const headers = ['#', 'Plate', 'Vehicle', 'Declared Value (SAR)', 'Certificate #', 'Premium (SAR)', 'Active']
    const rows = vehs.map((v, i) => [
      i+1, v.plate_number || '', v.vehicle_make_model || '',
      +v.declared_value || 0, v.individual_cert_number || '',
      +v.individual_premium || 0, v.is_active ? 'Yes' : 'No',
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    applyStyles(ws, headers, rows, bgHex)
    ws['!cols'] = [{ wch:5 },{ wch:14 },{ wch:24 },{ wch:20 },{ wch:20 },{ wch:16 },{ wch:8 }]
    // Totals
    const totalRow = vehs.length + 1
    XLSX.utils.sheet_add_aoa(ws, [[
      '', 'TOTAL', `${vehs.length} vehicles`,
      vehs.reduce((s,v)=>s+(+v.declared_value||0),0),
      '', vehs.reduce((s,v)=>s+(+v.individual_premium||0),0), ''
    ]], { origin: totalRow })
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet')
  }

  if (tabType === 'SHIPMENT') {
    const ships = policy.insurance_shipments || []
    const headers = ['#', 'Cert #', 'Cargo', 'Origin', 'Destination', 'Mode', 'BoL/AWB', 'Invoice (SAR)', 'Coverage (SAR)', 'Premium (SAR)', 'Status']
    const rows = ships.map((s, i) => [
      i+1, s.certificate_number || '',
      s.cargo_description || '',
      `${s.origin_city||''}, ${s.origin_country||''}`,
      `${s.destination_city||''}, ${s.destination_country||''}`,
      s.transport_mode || '', s.bol_awb_number || '',
      +s.invoice_value || 0, +s.coverage_amount || 0,
      +s.premium || 0, s.status || '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    applyStyles(ws, headers, rows, bgHex)
    ws['!cols'] = [{ wch:5 },{ wch:16 },{ wch:24 },{ wch:18 },{ wch:18 },{ wch:10 },{ wch:16 },{ wch:16 },{ wch:16 },{ wch:14 },{ wch:12 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Shipments')
  }

  const fname = `Insurance_${tabType}_${policy.insurer_name.replace(/\s+/g,'_')}_${policy.inception_date || 'export'}.xlsx`
  XLSX.writeFile(wb, fname)
}

// ── Legacy CSV helper (kept for quick single-table fallback) ──────────────────
function downloadCSV(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ──────────────────────────────────────────────────────────────────────────────
export default function InsuranceManager({ entityId }) {
  const [tab,          setTab]          = useState('HEALTH')   // HEALTH | VEHICLE | SHIPMENT
  const [policies,     setPolicies]     = useState([])
  const [employees,    setEmployees]    = useState([])
  const [dependents,   setDependents]   = useState([])         // { id, employee_id, full_name, relationship }
  const [vehicles,     setVehicles]     = useState([])         // own fleet only
  const [loading,      setLoading]      = useState(true)
  const [openPolicy,   setOpenPolicy]   = useState(null)

  // Form state
  const [showBanner,   setShowBanner]   = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [step,         setStep]         = useState(1)
  const [policyForm,   setPolicyForm]   = useState(EMPTY_POLICY)
  const [memberLines,  setMemberLines]  = useState([])
  const [vehicleLines, setVehicleLines] = useState([])
  const [saving,       setSaving]       = useState(false)

  // CSV import ref
  const csvRef = useRef(null)

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [
      { data: pData },
      { data: eData },
      { data: dData },
      { data: vData },
    ] = await Promise.all([
      supabase.from('insurance_policies')
        .select(`
          *,
          insurance_members(
            *,
            employees(full_name_en, iqama_number),
            employee_dependents(full_name, relationship, id_type, id_number, iqama_expiry)
          ),
          insurance_vehicles(*),
          insurance_shipments(*)
        `)
        .eq('entity_id', entityId)
        .order('inception_date', { ascending: false })
        .limit(300),
      supabase.from('employees')
        .select('id, full_name_en, iqama_number, department')
        .eq('entity_id', entityId).neq('is_active', false)
        .order('full_name_en').limit(500),
      supabase.from('employee_dependents')
        .select('id, employee_id, full_name, relationship, id_type, id_number, iqama_expiry')
        .eq('entity_id', entityId).limit(2000),
      supabase.from('vehicles')
        .select('id, plate_number, make, model, year, fleet_value')
        .eq('entity_id', entityId).eq('ownership_type', 'OWN')
        .order('plate_number').limit(200),
    ])
    setPolicies(pData || [])
    setEmployees(eData || [])
    setDependents(dData || [])
    setVehicles(vData || [])
    setLoading(false)
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inp  = { padding:'7px 10px', borderRadius:4, border:'1px solid #dde3ec', fontSize:12, outline:'none', fontFamily:'Poppins,sans-serif', boxSizing:'border-box' }
  const btn  = (bg = MC, c = '#fff') => ({ background:bg, color:c, border:'none', borderRadius:4, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Poppins,sans-serif' })
  const lbl  = { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 }
  const TH   = { padding:'7px 10px', background:MC, color:'#fff', fontWeight:700, fontSize:11, textAlign:'left', whiteSpace:'nowrap' }
  const TD   = { padding:'7px 10px', fontSize:12, borderBottom:'1px solid #f0f4f8', verticalAlign:'middle', whiteSpace:'nowrap' }

  const accent = TAB_COLOR[tab] || MC

  // ── Filter policies by tab ──────────────────────────────────────────────────
  const tabPolicies = policies.filter(p => p.policy_type === tab)

  // ── KPI counts ──────────────────────────────────────────────────────────────
  const kpiCounts = policies.reduce((acc, p) => {
    if (!acc[p.policy_type]) acc[p.policy_type] = { active:0, expired:0, total:0 }
    acc[p.policy_type].total++
    if (p.status === 'ACTIVE')  acc[p.policy_type].active++
    if (p.status === 'EXPIRED') acc[p.policy_type].expired++
    return acc
  }, {})

  // ── Open new form ───────────────────────────────────────────────────────────
  function openNew() {
    setPolicyForm({ ...EMPTY_POLICY, policy_type: tab })
    setMemberLines([])
    setVehicleLines([])
    setStep(1)
    setShowBanner(true)
  }

  // ── Go to Step 2 — auto-populate based on type ──────────────────────────────
  function goToStep2() {
    if (!policyForm.insurer_name) { alert('Insurer Name is required'); return }
    if (!policyForm.inception_date || !policyForm.expiry_date) { alert('Inception and Expiry dates are required'); return }

    if (tab === 'HEALTH' && memberLines.length === 0) {
      // Pre-populate all active employees
      setMemberLines(employees.map(e => ({
        employee_id: e.id, employee_name: e.full_name_en,
        iqama_number: e.iqama_number || '',
        coverage_class: 'B', individual_policy_number: '',
        is_employee: true, sponsor_id: null,
      })))
    }
    if (tab === 'VEHICLE' && vehicleLines.length === 0) {
      setVehicleLines(vehicles.map(v => ({
        vehicle_id: v.id,
        plate_number: v.plate_number,
        vehicle_label: `${v.make} ${v.model} ${v.year}`.trim(),
        declared_value: v.fleet_value || 0,
        individual_cert_number: '', individual_premium: 0,
      })))
    }
    setStep(2)
  }

  // ── CSV import for Health members ───────────────────────────────────────────
  function handleCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').filter(Boolean)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''))
      const iIqama  = headers.findIndex(h => h.includes('iqama'))
      const iPolicy = headers.findIndex(h => h.includes('policy') || h.includes('cert'))
      const iClass  = headers.findIndex(h => h.includes('class'))

      if (iIqama < 0 || iPolicy < 0) {
        alert('CSV must have columns: iqama_number, policy_number (and optionally coverage_class)')
        return
      }

      // Build iqama → employee map
      const iqamaMap = {}
      for (const emp of employees) { if (emp.iqama_number) iqamaMap[emp.iqama_number] = emp }

      const updated = [...memberLines]
      let matched = 0, unmatched = 0
      for (let i = 1; i < lines.length; i++) {
        const cols    = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        const iqama   = cols[iIqama]
        const polNum  = cols[iPolicy]
        const cls     = iClass >= 0 ? cols[iClass].toUpperCase() : null

        const emp = iqamaMap[iqama]
        if (!emp) { unmatched++; continue }
        matched++

        const idx = updated.findIndex(m => m.employee_id === emp.id && m.is_employee)
        if (idx >= 0) {
          updated[idx] = {
            ...updated[idx],
            individual_policy_number: polNum,
            coverage_class: (cls && CLASSES.includes(cls)) ? cls : updated[idx].coverage_class,
          }
        }
      }

      setMemberLines(updated)
      alert(`CSV imported: ${matched} matched, ${unmatched} unmatched (no employee found for that Iqama#)`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Toggle dependent rows for an employee ──────────────────────────────────
  function toggleDependents(empId, empClass) {
    const empDeps = dependents.filter(d => d.employee_id === empId)
    if (!empDeps.length) return
    const hasDeps = memberLines.some(m => m.sponsor_id === empId && !m.is_employee)
    if (hasDeps) {
      setMemberLines(prev => prev.filter(m => !(m.sponsor_id === empId && !m.is_employee)))
    } else {
      const depRows = empDeps.map(d => ({
        employee_id: empId, dependent_id: d.id,
        employee_name: d.full_name || '',
        iqama_number: d.id_number || '',
        coverage_class: empClass, // locked to sponsor's class
        individual_policy_number: '',
        is_employee: false, sponsor_id: empId,
        relationship: d.relationship,
      }))
      setMemberLines(prev => {
        const idx = prev.findLastIndex(m => m.employee_id === empId)
        const next = [...prev]
        next.splice(idx + 1, 0, ...depRows)
        return next
      })
    }
  }

  function setMemberField(idx, key, val) {
    setMemberLines(prev => prev.map((m, i) => {
      if (i !== idx) return m
      // If class changes on an employee, cascade to their dependents
      if (key === 'coverage_class' && m.is_employee) {
        return { ...m, [key]: val }
        // (cascade happens in a separate pass below)
      }
      return { ...m, [key]: val }
    }).map(m => {
      // Cascade class change from employee to dependents
      if (key === 'coverage_class' && !m.is_employee && m.sponsor_id === memberLines[idx]?.employee_id) {
        return { ...m, coverage_class: val }
      }
      return m
    }))
  }

  // ── Save policy ─────────────────────────────────────────────────────────────
  async function savePolicy() {
    setSaving(true)
    const { data: pol, error } = await supabase.from('insurance_policies').insert({
      entity_id:            entityId,
      policy_type:          tab,
      insurer_name:         policyForm.insurer_name,
      master_policy_number: policyForm.master_policy_number || null,
      broker_name:          policyForm.broker_name || null,
      inception_date:       policyForm.inception_date,
      expiry_date:          policyForm.expiry_date,
      total_premium:        +policyForm.total_premium || 0,
      currency:             policyForm.currency || 'SAR',
      notes:                policyForm.notes || null,
      status:               'ACTIVE',
    }).select().single()

    if (error) { alert(error.message); setSaving(false); return }

    if (tab === 'HEALTH' && memberLines.length > 0) {
      await supabase.from('insurance_members').insert(
        memberLines.map(m => ({
          policy_id:               pol.id,
          entity_id:               entityId,
          member_type:             m.is_employee ? 'EMPLOYEE' : 'DEPENDENT',
          employee_id:             m.employee_id || null,
          dependent_id:            m.dependent_id || null,
          individual_policy_number: m.individual_policy_number || null,
          coverage_class:          m.coverage_class || 'B',
          is_active:               true,
        }))
      )
    }

    if (tab === 'VEHICLE' && vehicleLines.length > 0) {
      await supabase.from('insurance_vehicles').insert(
        vehicleLines.map(v => ({
          policy_id:             pol.id,
          entity_id:             entityId,
          vehicle_id:            v.vehicle_id || null,
          plate_number:          v.plate_number,
          vehicle_make_model:    v.vehicle_label,
          individual_cert_number: v.individual_cert_number || null,
          declared_value:        +v.declared_value || 0,
          individual_premium:    +v.individual_premium || 0,
          is_active:             true,
        }))
      )
    }

    setSaving(false)
    setShowForm(false)
    setStep(1)
    load()
  }

  // ── Excel export ─────────────────────────────────────────────────────────────
  function exportHealth(policy) {
    const rows = (policy.insurance_members || []).map(m => ({
      'Policy #':         policy.master_policy_number || '',
      'Insurer':          policy.insurer_name,
      'Inception':        policy.inception_date,
      'Expiry':           policy.expiry_date,
      'Member Type':      m.member_type,
      'Employee Name':    m.member_type === 'EMPLOYEE' ? (m.employees?.full_name_en || '') : (m.employee_dependents?.full_name || ''),
      'Iqama #':          m.member_type === 'EMPLOYEE' ? (m.employees?.iqama_number || '') : (m.employee_dependents?.id_number || ''),
      'Coverage Class':   m.coverage_class,
      'Individual Cert':  m.individual_policy_number || '',
      'Status':           m.is_active ? 'Active' : 'Inactive',
    }))
    downloadCSV(rows, `Health_Insurance_${policy.insurer_name}_${policy.inception_date}.csv`)
  }

  function exportVehicle(policy) {
    const rows = (policy.insurance_vehicles || []).map(v => ({
      'Policy #':         policy.master_policy_number || '',
      'Insurer':          policy.insurer_name,
      'Inception':        policy.inception_date,
      'Expiry':           policy.expiry_date,
      'Plate':            v.plate_number,
      'Vehicle':          v.vehicle_make_model || '',
      'Declared Value':   v.declared_value || 0,
      'Cert #':           v.individual_cert_number || '',
      'Premium':          v.individual_premium || 0,
      'Status':           v.is_active ? 'Active' : 'Inactive',
    }))
    downloadCSV(rows, `Vehicle_Insurance_${policy.insurer_name}_${policy.inception_date}.csv`)
  }

  function exportShipment(policy) {
    const rows = (policy.insurance_shipments || []).map(s => ({
      'Policy #':         policy.master_policy_number || '',
      'Cert #':           s.certificate_number || '',
      'Cargo':            s.cargo_description,
      'Origin':           `${s.origin_city || ''}, ${s.origin_country || ''}`,
      'Destination':      `${s.destination_city || ''}, ${s.destination_country || ''}`,
      'Mode':             s.transport_mode,
      'BoL / AWB':        s.bol_awb_number || '',
      'Invoice Value':    s.invoice_value || 0,
      'Coverage':         s.coverage_amount || 0,
      'Premium':          s.premium || 0,
      'Status':           s.status,
      'Shipment Date':    s.shipment_date || '',
    }))
    downloadCSV(rows, `Shipment_Insurance_${policy.insurer_name}_${policy.inception_date}.csv`)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:'Poppins,sans-serif', fontSize:13 }}>

      {/* ── Tab bar ── */}
      <div style={{ display:'flex', gap:0, marginBottom:14, background:'#f0f4f8', borderRadius:8, padding:3, width:'fit-content' }}>
        {['HEALTH','VEHICLE','SHIPMENT'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? TAB_COLOR[t] : 'transparent',
            color: tab === t ? '#fff' : '#6b7c93',
            border:'none', borderRadius:6, padding:'7px 20px', fontSize:12, fontWeight:700, cursor:'pointer',
            fontFamily:'Poppins,sans-serif', transition:'all 0.15s',
          }}>
            {t === 'HEALTH' ? '🏥 Health' : t === 'VEHICLE' ? '🚗 Vehicle' : '📦 Shipment'}
          </button>
        ))}
      </div>

      {/* ── Header row ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:12, color:'#64748b' }}>
          {tab === 'HEALTH'   && 'Group health insurance — per-employee & dependent certificates, coverage classes, CSV import'}
          {tab === 'VEHICLE'  && 'Fleet insurance — per-vehicle certificates, declared values, Own Fleet only'}
          {tab === 'SHIPMENT' && 'Cargo & shipment insurance — per-shipment certificates, route, BoL tracking'}
        </div>
        <button style={{ ...btn(accent), whiteSpace:'nowrap' }} onClick={openNew}>+ New {tab} Policy</button>
      </div>

      {/* ── KPI strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
        {['HEALTH','VEHICLE','SHIPMENT'].map(t => {
          const k = kpiCounts[t] || { total:0, active:0, expired:0 }
          return (
            <div key={t} onClick={() => setTab(t)} style={{
              background:`linear-gradient(135deg,${TAB_COLOR[t]}dd,${TAB_COLOR[t]})`,
              borderRadius:8, padding:'10px 16px', color:'#fff', cursor:'pointer',
              boxShadow: tab===t ? `0 0 0 3px #fff,0 0 0 5px ${TAB_COLOR[t]}` : '0 2px 8px rgba(0,0,0,0.15)',
              transform: tab===t ? 'scale(1.03)' : 'scale(1)', transition:'all 0.15s',
            }}>
              <div style={{ fontSize:22, fontWeight:800, lineHeight:1 }}>{k.active}</div>
              <div style={{ fontSize:10, opacity:0.85, marginTop:2 }}>Active {t} Policies</div>
              {k.expired > 0 && <div style={{ fontSize:10, opacity:0.7 }}>{k.expired} expired</div>}
            </div>
          )
        })}
      </div>

      {/* ── Policy list ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : tabPolicies.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#aab2bd', fontSize:13 }}>
          No {tab.toLowerCase()} insurance policies — create the first one above.
        </div>
      ) : tabPolicies.map(pol => {
        const isOpen   = openPolicy === pol.id
        const members  = pol.insurance_members  || []
        const vehLines = pol.insurance_vehicles  || []
        const ships    = pol.insurance_shipments || []
        const memberCount = tab === 'HEALTH' ? members.length
                          : tab === 'VEHICLE' ? vehLines.length
                          : ships.length
        const statusColor = pol.status === 'ACTIVE' ? '#2e7d32' : pol.status === 'EXPIRED' ? '#b71c1c' : '#6b7c93'
        const statusBg    = pol.status === 'ACTIVE' ? '#e8f5e9' : pol.status === 'EXPIRED' ? '#ffebee' : '#f5f7fa'

        return (
          <div key={pol.id} style={{ background:'#fff', borderRadius:10, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:'1px solid #e8edf2', overflow:'hidden' }}>
            {/* Card header */}
            <div style={{ padding:'14px 18px', background:'#fafbfc', borderBottom: isOpen ? '1px solid #eef1f6' : 'none', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:240 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
                  <span style={{ fontWeight:800, fontSize:14, color:'#1a2e3d' }}>{pol.insurer_name}</span>
                  {pol.master_policy_number && (
                    <span style={{ fontSize:11, fontFamily:'monospace', color:'#6b7c93', background:'#f0f4f8', borderRadius:4, padding:'2px 8px' }}>
                      #{pol.master_policy_number}
                    </span>
                  )}
                  <span style={{ fontSize:10, fontWeight:800, background:statusBg, color:statusColor, borderRadius:10, padding:'2px 10px' }}>
                    {pol.status}
                  </span>
                </div>
                <div style={{ display:'flex', gap:14, marginTop:5, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, color:'#6b7c93' }}>📅 {fmt(pol.inception_date)} → {fmt(pol.expiry_date)}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:accent }}>SAR {(+pol.total_premium||0).toLocaleString()} premium</span>
                  <span style={{ fontSize:11, color:'#6b7c93' }}>
                    {tab==='HEALTH' ? `👥 ${members.filter(m=>m.member_type==='EMPLOYEE').length} employees, ${members.filter(m=>m.member_type==='DEPENDENT').length} dependents`
                    : tab==='VEHICLE' ? `🚗 ${vehLines.length} vehicles`
                    : `📦 ${ships.length} shipments`}
                  </span>
                  {pol.broker_name && <span style={{ fontSize:11, color:'#6b7c93' }}>Broker: {pol.broker_name}</span>}
                </div>
              </div>

              {/* Export */}
              <button style={{ ...btn('#f0f4f8','#1a2e3d'), fontSize:11, padding:'5px 12px' }}
                onClick={() => exportPolicyXLSX(pol, tab)}>
                ⬇ Export Excel
              </button>

              <button style={{ ...btn('#f0f4f8','#1a2e3d'), fontSize:11, padding:'5px 10px' }}
                onClick={() => setOpenPolicy(isOpen ? null : pol.id)}>
                {isOpen ? '▲ Hide' : '▼ Details'}
              </button>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ overflowX:'auto' }}>

                {/* HEALTH: members table */}
                {tab === 'HEALTH' && (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:700 }}>
                    <thead>
                      <tr>
                        {['Type','Name','Iqama #','Class','Individual Policy #','Status'].map(h=>(
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.length === 0 ? (
                        <tr><td colSpan={6} style={{ ...TD, textAlign:'center', color:'#aab2bd', padding:24 }}>No members recorded</td></tr>
                      ) : members.map((m, i) => {
                        const mName   = m.member_type === 'EMPLOYEE'
                          ? (m.employees?.full_name_en || '—')
                          : (m.employee_dependents?.full_name || '—')
                        const mIqama  = m.member_type === 'EMPLOYEE'
                          ? (m.employees?.iqama_number || '—')
                          : (m.employee_dependents?.id_type === 'Iqama'
                              ? (m.employee_dependents?.id_number || '—')
                              : (m.employee_dependents?.id_number || '—'))
                        return (
                        <tr key={m.id} style={{ background: m.member_type==='DEPENDENT' ? '#fafbff' : i%2===0?'#fff':'#fafbfc' }}>
                          <td style={TD}>
                            {m.member_type==='DEPENDENT'
                              ? <span style={{ color:'#6b7c93', fontSize:11 }}>↳ Dependent</span>
                              : <span style={{ fontWeight:700, color:'#1a2e3d' }}>Employee</span>}
                          </td>
                          <td style={{ ...TD, fontWeight: m.member_type==='EMPLOYEE'?700:400, paddingLeft: m.member_type==='DEPENDENT'?24:10 }}>
                            {mName}
                          </td>
                          <td style={{ ...TD, fontFamily:'monospace', fontSize:11 }}>{mIqama}</td>
                          <td style={TD}>
                            <span style={{ background:`${accent}22`, color:accent, borderRadius:4, padding:'2px 8px', fontWeight:700, fontSize:11 }}>
                              {m.coverage_class}
                            </span>
                          </td>
                          <td style={{ ...TD, fontFamily:'monospace' }}>{m.individual_policy_number || <span style={{ color:'#aab2bd' }}>—</span>}</td>
                          <td style={TD}>
                            <span style={{ fontSize:10, fontWeight:700, color: m.is_active?'#2e7d32':'#b71c1c' }}>
                              {m.is_active ? '✓ Active' : '✕ Inactive'}
                            </span>
                          </td>
                        </tr>
                        )
                      })}
                      <tr style={{ background:'#f7f2ed' }}>
                        <td colSpan={5} style={{ ...TD, fontWeight:800, textAlign:'right', color:accent, fontSize:11, borderBottom:'none' }}>
                          TOTAL MEMBERS
                        </td>
                        <td style={{ ...TD, fontWeight:800, color:accent, borderBottom:'none' }}>{members.length}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* VEHICLE: vehicles table */}
                {tab === 'VEHICLE' && (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:700 }}>
                    <thead>
                      <tr>
                        {['Plate','Vehicle','Declared Value','Cert #','Premium','Status'].map(h=>(
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vehLines.length === 0 ? (
                        <tr><td colSpan={6} style={{ ...TD, textAlign:'center', color:'#aab2bd', padding:24 }}>No vehicles recorded</td></tr>
                      ) : vehLines.map((v, i) => (
                        <tr key={v.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                          <td style={{ ...TD, fontFamily:'monospace', fontWeight:700 }}>{v.plate_number}</td>
                          <td style={TD}>{v.vehicle_make_model || '—'}</td>
                          <td style={{ ...TD, fontWeight:700, color:accent }}>SAR {(+v.declared_value||0).toLocaleString()}</td>
                          <td style={{ ...TD, fontFamily:'monospace' }}>{v.individual_cert_number || <span style={{ color:'#aab2bd' }}>—</span>}</td>
                          <td style={TD}>{v.individual_premium > 0 ? `SAR ${(+v.individual_premium).toLocaleString()}` : '—'}</td>
                          <td style={TD}>
                            <span style={{ fontSize:10, fontWeight:700, color: v.is_active?'#2e7d32':'#b71c1c' }}>
                              {v.is_active ? '✓ Active' : '✕ Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background:'#f7f2ed' }}>
                        <td colSpan={2} style={{ ...TD, fontWeight:800, textAlign:'right', color:accent, fontSize:11, borderBottom:'none' }}>
                          TOTAL FLEET VALUE
                        </td>
                        <td style={{ ...TD, fontWeight:800, color:accent, borderBottom:'none' }}>
                          SAR {vehLines.reduce((s,v)=>s+(+v.declared_value||0),0).toLocaleString()}
                        </td>
                        <td colSpan={3} style={{ ...TD, borderBottom:'none' }} />
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* SHIPMENT: shipments table */}
                {tab === 'SHIPMENT' && (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:900 }}>
                    <thead>
                      <tr>
                        {['Cert #','Cargo','Origin → Dest','Mode','BoL/AWB','Invoice','Coverage','Status'].map(h=>(
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ships.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...TD, textAlign:'center', color:'#aab2bd', padding:24 }}>No shipments recorded</td></tr>
                      ) : ships.map((s, i) => (
                        <tr key={s.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                          <td style={{ ...TD, fontFamily:'monospace' }}>{s.certificate_number||'—'}</td>
                          <td style={{ ...TD, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis' }}>{s.cargo_description}</td>
                          <td style={TD}>{s.origin_city||'?'} → {s.destination_city||'?'}</td>
                          <td style={TD}>{s.transport_mode}</td>
                          <td style={{ ...TD, fontFamily:'monospace', fontSize:11 }}>{s.bol_awb_number||'—'}</td>
                          <td style={TD}>{s.invoice_value > 0 ? `SAR ${(+s.invoice_value).toLocaleString()}` : '—'}</td>
                          <td style={{ ...TD, fontWeight:700, color:accent }}>{s.coverage_amount > 0 ? `SAR ${(+s.coverage_amount).toLocaleString()}` : '—'}</td>
                          <td style={TD}>
                            <span style={{ fontSize:10, fontWeight:700,
                              color: s.status==='ARRIVED'?'#2e7d32' : s.status==='CLAIMED'?'#c62828' : s.status==='OPEN'?'#e65100' : '#6b7c93' }}>
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

              </div>
            )}
          </div>
        )
      })}

      {/* ══════════════════════════════════════════════════════════════════════
          PAGE BANNER
      ══════════════════════════════════════════════════════════════════════ */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setStep(1); setShowForm(true) }}
        chapterName="HR"
        formTitle={['New', tab.charAt(0) + tab.slice(1).toLowerCase(), 'Policy']}
        heading={`Create a new ${tab.toLowerCase()} insurance policy`}
        iconLabel={tab === 'HEALTH' ? '🏥' : tab === 'VEHICLE' ? '🚗' : '📦'}
        workflowSteps={['Policy Details', tab === 'SHIPMENT' ? 'Shipment Info' : tab === 'VEHICLE' ? 'Assign Vehicles' : 'Assign Members']}
        description={
          tab === 'HEALTH'   ? 'Enter policy details, then assign employees and dependents. Use CSV upload to bulk-import individual certificate numbers from the insurer.' :
          tab === 'VEHICLE'  ? 'Enter policy details. All own-fleet vehicles are pre-loaded — assign individual certificate numbers and declared values.' :
          'Enter the master open-cover policy details. Add individual shipment certificates as cargo moves.'
        }
      />

      {/* ══════════════════════════════════════════════════════════════════════
          FORM SHELL WIZARD
      ══════════════════════════════════════════════════════════════════════ */}
      <FormShell
        isOpen={showForm}
        onClose={() => { setShowForm(false); setStep(1) }}
        chapterName="HR"
        title={['New', tab.charAt(0) + tab.slice(1).toLowerCase(), 'Policy']}
        steps={['Policy Details', tab === 'HEALTH' ? 'Members' : tab === 'VEHICLE' ? 'Vehicles' : 'Shipment Info']}
        currentStep={step}
        onBack={() => setStep(1)}
        onNext={step === 1 ? goToStep2 : savePolicy}
        nextLabel={step === 1 ? 'Next →' : saving ? 'Saving…' : 'Create Policy'}
        nextDisabled={saving}
      >

        {/* ── Step 1: Policy Details ── */}
        {step === 1 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <div>
              <label style={lbl}>Insurer Name *</label>
              <input style={{ ...inp, width:'100%' }} placeholder="e.g. Malath Insurance"
                value={policyForm.insurer_name}
                onChange={e => setPolicyForm(p => ({ ...p, insurer_name: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Master Policy Number</label>
              <input style={{ ...inp, width:'100%', fontFamily:'monospace' }} placeholder="Insurer's reference"
                value={policyForm.master_policy_number}
                onChange={e => setPolicyForm(p => ({ ...p, master_policy_number: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Broker Name</label>
              <input style={{ ...inp, width:'100%' }} placeholder="If via broker"
                value={policyForm.broker_name}
                onChange={e => setPolicyForm(p => ({ ...p, broker_name: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Inception Date *</label>
              <input type="date" style={{ ...inp, width:'100%' }}
                value={policyForm.inception_date}
                onChange={e => setPolicyForm(p => ({ ...p, inception_date: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Expiry Date *</label>
              <input type="date" style={{ ...inp, width:'100%' }}
                value={policyForm.expiry_date}
                onChange={e => setPolicyForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Total Premium (SAR)</label>
              <input type="number" style={{ ...inp, width:'100%' }}
                value={policyForm.total_premium}
                onChange={e => setPolicyForm(p => ({ ...p, total_premium: e.target.value }))} />
            </div>
            <div style={{ gridColumn:'1 / 4' }}>
              <label style={lbl}>Notes</label>
              <input style={{ ...inp, width:'100%' }} placeholder="Any remarks…"
                value={policyForm.notes}
                onChange={e => setPolicyForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
        )}

        {/* ── Step 2: HEALTH — Members ── */}
        {step === 2 && tab === 'HEALTH' && (
          <div>
            {/* CSV import toolbar */}
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, background:'#f0f4f8', borderRadius:8, padding:'10px 14px', flexWrap:'wrap' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#1a2e3d', flex:1 }}>
                {memberLines.filter(m=>m.is_employee).length} employees · {memberLines.filter(m=>!m.is_employee).length} dependents
              </div>
              <div style={{ fontSize:11, color:'#6b7c93' }}>
                CSV columns: <code>iqama_number, policy_number, coverage_class</code>
              </div>
              <input ref={csvRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleCSV} />
              <button style={{ ...btn('#f0f4f8','#1a2e3d'), border:`1px solid ${accent}`, fontSize:11 }}
                onClick={() => csvRef.current?.click()}>
                ⬆ Import CSV
              </button>
            </div>

            {/* Members table */}
            <div style={{ overflowX:'auto', maxHeight:420, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:700 }}>
                <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                  <tr>
                    <th style={TH}>Employee / Dependent</th>
                    <th style={TH}>Iqama #</th>
                    <th style={TH}>Class</th>
                    <th style={TH}>Individual Policy #</th>
                    <th style={TH}>Deps</th>
                  </tr>
                </thead>
                <tbody>
                  {memberLines.map((m, i) => {
                    const empDeps = dependents.filter(d => d.employee_id === m.employee_id)
                    const hasDepsShown = memberLines.some(x => x.sponsor_id === m.employee_id && !x.is_employee)
                    return (
                      <tr key={i} style={{ background: !m.is_employee ? '#f5f7ff' : i%2===0?'#fff':'#fafbfc' }}>
                        <td style={{ ...TD, fontWeight: m.is_employee?700:400, paddingLeft: m.is_employee?10:24, color: m.is_employee?'#1a2e3d':'#6b7c93' }}>
                          {!m.is_employee && '↳ '}{m.employee_name}
                          {!m.is_employee && m.relationship && <span style={{ fontSize:10, color:'#aab2bd', marginLeft:6 }}>{m.relationship}</span>}
                        </td>
                        <td style={{ ...TD, fontFamily:'monospace', fontSize:11 }}>{m.iqama_number || '—'}</td>
                        <td style={TD}>
                          {!m.is_employee
                            ? <span style={{ background:`${accent}22`, color:accent, borderRadius:4, padding:'2px 8px', fontWeight:700, fontSize:11 }}>{m.coverage_class} 🔒</span>
                            : (
                              <select style={{ ...inp, padding:'4px 8px', fontSize:11 }}
                                value={m.coverage_class}
                                onChange={e => setMemberField(i, 'coverage_class', e.target.value)}>
                                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            )
                          }
                        </td>
                        <td style={TD}>
                          <input style={{ ...inp, width:160, fontFamily:'monospace', fontSize:11 }}
                            placeholder="Cert #"
                            value={m.individual_policy_number}
                            onChange={e => setMemberField(i, 'individual_policy_number', e.target.value)} />
                        </td>
                        <td style={TD}>
                          {m.is_employee && empDeps.length > 0 && (
                            <button style={{ ...btn(hasDepsShown ? '#e8f5e9' : '#f0f4f8', hasDepsShown ? '#2e7d32' : accent), padding:'3px 10px', fontSize:10, border:`1px solid ${hasDepsShown?'#a5d6a7':'#dde3ec'}` }}
                              onClick={() => toggleDependents(m.employee_id, m.coverage_class)}>
                              {hasDepsShown ? `▲ ${empDeps.length} dep` : `+ ${empDeps.length} dep`}
                            </button>
                          )}
                          {m.is_employee && empDeps.length === 0 && <span style={{ fontSize:10, color:'#aab2bd' }}>No deps</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Step 2: VEHICLE — Assign Vehicles ── */}
        {step === 2 && tab === 'VEHICLE' && (
          <div>
            <div style={{ fontSize:12, color:'#6b7c93', marginBottom:12 }}>
              All Own Fleet vehicles are listed. Enter the individual certificate number and confirm the declared value for each.
            </div>
            <div style={{ overflowX:'auto', maxHeight:420, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:650 }}>
                <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                  <tr>
                    <th style={TH}>Plate</th>
                    <th style={TH}>Vehicle</th>
                    <th style={TH}>Declared Value (SAR)</th>
                    <th style={TH}>Certificate #</th>
                    <th style={TH}>Premium (SAR)</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleLines.map((v, i) => (
                    <tr key={i} style={{ background: i%2===0?'#fff':'#fafbfc' }}>
                      <td style={{ ...TD, fontFamily:'monospace', fontWeight:700 }}>{v.plate_number}</td>
                      <td style={TD}>{v.vehicle_label}</td>
                      <td style={TD}>
                        <input type="number" style={{ ...inp, width:130 }}
                          value={v.declared_value}
                          onChange={e => setVehicleLines(prev => prev.map((x,xi) => xi===i ? { ...x, declared_value: e.target.value } : x))} />
                      </td>
                      <td style={TD}>
                        <input style={{ ...inp, width:150, fontFamily:'monospace' }}
                          placeholder="Cert #"
                          value={v.individual_cert_number}
                          onChange={e => setVehicleLines(prev => prev.map((x,xi) => xi===i ? { ...x, individual_cert_number: e.target.value } : x))} />
                      </td>
                      <td style={TD}>
                        <input type="number" style={{ ...inp, width:110 }}
                          value={v.individual_premium}
                          onChange={e => setVehicleLines(prev => prev.map((x,xi) => xi===i ? { ...x, individual_premium: e.target.value } : x))} />
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background:'#f7f2ed' }}>
                    <td colSpan={2} style={{ ...TD, fontWeight:800, textAlign:'right', color:accent, fontSize:11, borderBottom:'none' }}>TOTAL FLEET VALUE</td>
                    <td style={{ ...TD, fontWeight:800, color:accent, borderBottom:'none' }}>
                      SAR {vehicleLines.reduce((s,v) => s + (+v.declared_value||0), 0).toLocaleString()}
                    </td>
                    <td colSpan={2} style={{ ...TD, borderBottom:'none' }} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Step 2: SHIPMENT — note: shipments added after policy is created ── */}
        {step === 2 && tab === 'SHIPMENT' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:36 }}>📦</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#1a2e3d' }}>
              Policy will be created as an open-cover master.
            </div>
            <div style={{ fontSize:12, color:'#6b7c93', textAlign:'center', maxWidth:380 }}>
              Individual shipment certificates are added after creation — one per shipment as cargo moves.
              Click <strong>Create Policy</strong> to proceed.
            </div>
          </div>
        )}

      </FormShell>
    </div>
  )
}
