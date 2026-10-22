import { GROUP_COLORS } from '../styles/appStyles'
import PageBanner from '../components/PageBanner'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ── WF Code Library ─────────────────────────────────────────────
// Each code: label, depts[], uom, stages[], pct{}
// pct keys: team, supplier, subcon, food, overtime, petty, misc
// Total pct should be <= 70 to maintain 30% margin target
const WF_CODES = {
  // ── NISU — Network Equipment ──────────────────────────────────
  'WF-SFP-S': {
    label: 'SFP / Optics Upgrade', depts: ['NISU'], uom: 'Lump Sum',
    stages: ['MOP Prepared','MDT Executed','Equipment Installed','Integration Done','PAT Passed','As-Built Submitted','Handover Complete'],
    pct: { team:30, supplier:15, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  'WF-CARD-M': {
    label: 'Card / Module Upgrade', depts: ['NISU'], uom: 'Lump Sum',
    stages: ['MOP Prepared','MDT Executed','Card Installed','Integration Done','PAT Passed','As-Built Submitted','Handover Complete'],
    pct: { team:28, supplier:18, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  'WF-NEW-M': {
    label: 'New Installation — Medium', depts: ['NISU'], uom: 'Lump Sum',
    stages: ['Site Survey','MOP Prepared','Equipment Delivered','Equipment Installed','Cabling Complete','Integration Done','PAT Passed','As-Built Submitted','Handover Complete'],
    pct: { team:35, supplier:20, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  'WF-NEW-L': {
    label: 'New Installation — Large', depts: ['NISU'], uom: 'Lump Sum',
    stages: ['Site Survey','MOP Prepared','Cabinet Installed','Equipment Delivered','Equipment Installed','Cabling Complete','Integration Done','PAT Passed','As-Built Submitted','Handover Complete'],
    pct: { team:35, supplier:22, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  'WF-MIG-M': {
    label: 'Migration — Medium', depts: ['NISU'], uom: 'Lump Sum',
    stages: ['MOP Prepared','Pre-check Done','Cutover Executed','Verification Done','PAT Passed','As-Built Submitted','Handover Complete'],
    pct: { team:40, supplier:5, subcon:0, food:10, overtime:8, petty:3, misc:2 },
  },
  'WF-MIG-L': {
    label: 'Migration — Large', depts: ['NISU'], uom: 'Lump Sum',
    stages: ['MOP Prepared','Pre-check Done','MDT Executed','Cutover Executed','Verification Done','PAT Passed','As-Built Submitted','Handover Complete'],
    pct: { team:40, supplier:5, subcon:0, food:10, overtime:10, petty:3, misc:2 },
  },
  'WF-DIS-M': {
    label: 'Decommission', depts: ['NISU'], uom: 'Lump Sum',
    stages: ['MOP Prepared','MDT Executed','Equipment Removed','Equipment Stored','As-Built Submitted','Handover Complete'],
    pct: { team:50, supplier:0, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  // ── MICROWAVE — CISU + TISU ───────────────────────────────────
  'WF-MW-P2P': {
    label: 'Microwave — Point to Point', depts: ['CISU','TISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Antenna Mount Installed','Dish Installed','Line of Sight Aligned','Fiber Cabling Done','Power Cabling Done','RFC / As-Built Submitted','Handover Complete'],
    pct: { team:30, supplier:15, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  'WF-MW-PTMP': {
    label: 'Microwave — Point to Multipoint', depts: ['CISU','TISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Antenna Mount Installed','Dishes Installed','LoS Aligned','Fiber Done','Power Done','RFC Submitted','Handover Complete'],
    pct: { team:30, supplier:18, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  'WF-MW-SWAP': {
    label: 'Microwave — Equipment Swap', depts: ['CISU','TISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Old Equipment Removed','New Equipment Installed','LoS Verified','RFC Submitted','Handover Complete'],
    pct: { team:35, supplier:15, subcon:0, food:10, overtime:5, petty:3, misc:2 },
  },
  // ── CABLING — CISU + ITSU ─────────────────────────────────────
  'WF-UTP-S': {
    label: 'UTP Cabling — Small (< 100 nodes)', depts: ['CISU','ITSU'], uom: 'Per Node',
    stages: ['Site Survey','Conduit / Duct Done','Cable Pulled','Termination Done','Testing Done','Handover Complete'],
    pct: { team:40, supplier:20, subcon:0, food:8, overtime:5, petty:3, misc:2 },
  },
  'WF-UTP-M': {
    label: 'UTP Cabling — Medium (100–500 nodes)', depts: ['CISU','ITSU'], uom: 'Per Node',
    stages: ['Site Survey','Design Approved','Conduit / Duct Done','Cable Pulled','Termination Done','Testing Done','Handover Complete'],
    pct: { team:38, supplier:22, subcon:0, food:8, overtime:5, petty:3, misc:2 },
  },
  'WF-UTP-L': {
    label: 'UTP Cabling — Large (> 500 nodes)', depts: ['CISU','ITSU'], uom: 'Per Node',
    stages: ['Site Survey','Design Approved','Conduit / Duct Done','Cable Pulled','Termination Done','Testing Done','Sign-off','Handover Complete'],
    pct: { team:35, supplier:22, subcon:5, food:8, overtime:5, petty:3, misc:2 },
  },
  'WF-FIBER-IN': {
    label: 'Indoor Fiber', depts: ['CISU','NISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Cable Pulled','Splicing Done','ODF Terminated','Testing Done','Handover Complete'],
    pct: { team:35, supplier:20, subcon:0, food:8, overtime:5, petty:3, misc:2 },
  },
  'WF-FIBER-OUT': {
    label: 'Outdoor Fiber Pulling', depts: ['CISU'], uom: 'Per KM',
    stages: ['Site Survey','Civil / Excavation Done','Duct Laid','Fiber Pulled','Splicing Done','Testing Done','Handover Complete'],
    pct: { team:25, supplier:15, subcon:20, food:8, overtime:5, petty:3, misc:2 },
  },
  // ── CCTV / AV / ACCESS — CISU ─────────────────────────────────
  'WF-CCTV-S': {
    label: 'CCTV — Small (< 8 cameras)', depts: ['CISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Cable Installed','Cameras Mounted','DVR/NVR Configured','Testing Done','Handover Complete'],
    pct: { team:30, supplier:25, subcon:0, food:8, overtime:3, petty:3, misc:2 },
  },
  'WF-CCTV-L': {
    label: 'CCTV — Large (> 8 cameras)', depts: ['CISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Design Approved','Cable Installed','Cameras Mounted','DVR/NVR Configured','Testing Done','Client Training','Handover Complete'],
    pct: { team:28, supplier:25, subcon:0, food:8, overtime:3, petty:3, misc:2 },
  },
  'WF-AV-M': {
    label: 'Audio Visual', depts: ['CISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Cable Installed','Equipment Mounted','System Configured','Testing Done','Handover Complete'],
    pct: { team:25, supplier:30, subcon:0, food:8, overtime:3, petty:3, misc:2 },
  },
  'WF-ACC-S': {
    label: 'Door Access Control', depts: ['CISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Cable Installed','Readers Mounted','Controller Configured','Testing Done','Handover Complete'],
    pct: { team:28, supplier:28, subcon:0, food:8, overtime:3, petty:3, misc:2 },
  },
  'WF-WIFI-M': {
    label: 'WiFi / AP Nodes', depts: ['CISU','ITSU'], uom: 'Per Node',
    stages: ['Site Survey','Design Approved','APs Mounted','Controller Configured','Testing Done','Handover Complete'],
    pct: { team:30, supplier:22, subcon:0, food:8, overtime:3, petty:3, misc:2 },
  },
  // ── ITSU — Configuration ──────────────────────────────────────
  'WF-CFG-SW': {
    label: 'Switch Installation & Config', depts: ['ITSU'], uom: 'Lump Sum',
    stages: ['Site Survey','RFC Approved','Rack & Stack Done','Cabling Done','Configuration Done','COC Issued'],
    pct: { team:40, supplier:15, subcon:0, food:8, overtime:5, petty:3, misc:2 },
  },
  'WF-CFG-WIFI': {
    label: 'WiFi + Controller Config', depts: ['ITSU'], uom: 'Lump Sum',
    stages: ['Site Survey','RFC Approved','APs Mounted','Controller Configured','Testing Done','COC Issued'],
    pct: { team:35, supplier:20, subcon:0, food:8, overtime:5, petty:3, misc:2 },
  },
  'WF-CFG-DC': {
    label: 'Data Centre Work', depts: ['ITSU','CISU'], uom: 'Lump Sum',
    stages: ['Site Survey','RFC Approved','Rack & Stack Done','Cabling Done','Power Done','Cooling Done','Testing Done','COC Issued'],
    pct: { team:30, supplier:25, subcon:0, food:8, overtime:5, petty:3, misc:2 },
  },
  // ── TOWER — TISU ──────────────────────────────────────────────
  'WF-TOWER-MONO': {
    label: 'Tower — Monopole', depts: ['TISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Design Review','Excavation Done','Lean Concrete Poured','Compaction Done','Backfilling Done','Water Pouring Done','Tower Assembly & Painting','Tower Erection','Cabinet Installation','Power & Earth Cabling','Fencing','Gravel','PAT Passed','Site Handover'],
    pct: { team:20, supplier:15, subcon:35, food:5, overtime:3, petty:2, misc:3 },
  },
  'WF-TOWER-3L': {
    label: 'Tower — 3-Leg Lattice', depts: ['TISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Design Review','Excavation Done','Lean Concrete Poured','Compaction Done','Backfilling Done','Water Pouring Done','Tower Assembly & Painting','Tower Erection','Cabinet Installation','Power & Earth Cabling','Transportation Done','Fencing','Gravel','PAT Passed','Site Handover'],
    pct: { team:18, supplier:15, subcon:37, food:5, overtime:3, petty:2, misc:3 },
  },
  'WF-TOWER-4L': {
    label: 'Tower — 4-Leg Lattice', depts: ['TISU'], uom: 'Lump Sum',
    stages: ['Site Survey','Design Review','Excavation Done','Lean Concrete Poured','Compaction Done','Backfilling Done','Water Pouring Done','Tower Assembly & Painting','Tower Erection','Cabinet Installation','Power & Earth Cabling','Transportation Done','Fencing','Gravel','PAT Passed','Site Handover'],
    pct: { team:18, supplier:15, subcon:38, food:5, overtime:3, petty:2, misc:3 },
  },
  // ── CIVIL — CISU + TISU ───────────────────────────────────────
  'WF-CIVIL-DUCT': {
    label: 'Civil — Conduit / Duct', depts: ['CISU','TISU'], uom: 'Per KM',
    stages: ['Site Survey','Marking Done','Excavation Done','Duct Laid','Backfilling Done','Testing Done','Handover Complete'],
    pct: { team:20, supplier:15, subcon:25, food:8, overtime:3, petty:3, misc:2 },
  },
}

const WF_LIST = Object.entries(WF_CODES).map(([code, v]) => ({ code, ...v }))

// ── Constants ────────────────────────────────────────────────────
const UNITS   = ['NISU','TISU','CISU','ITSU']
const STATUSES = ['PENDING','MOBILISED','IN_PROGRESS','MATERIAL_WAITING','COMPLETED','SNAGGING','HANDED_OVER','INVOICED']

const BUDGET_ROWS = [
  { key:'team',     pctKey:'budget_team_pct',     label:'Team Expenses', note:'incl. Payroll' },
  { key:'supplier', pctKey:'budget_supplier_pct',  label:'Supplier POs',  note:'Materials'     },
  { key:'subcon',   pctKey:'budget_subcon_pct',    label:'Subcon POs',    note:''              },
  { key:'food',     pctKey:'budget_food_pct',      label:'Food & Allow',  note:'FA / DE'       },
  { key:'overtime', pctKey:'budget_overtime_pct',  label:'Overtime',      note:'OT'            },
  { key:'petty',    pctKey:'budget_petty_pct',     label:'Petty Cash',    note:''              },
  { key:'misc',     pctKey:'budget_misc_pct',      label:'Miscellaneous', note:''              },
]

const STATUS_COLORS = {
  PENDING:'#9e9e9e', MOBILISED:'#1565c0', IN_PROGRESS:'#e65100',
  MATERIAL_WAITING:'#f57f17', COMPLETED:'#2e7d32', SNAGGING:'#6a1b9a',
  HANDED_OVER:'#00695c', INVOICED:'#1a237e',
}

// ── Helpers ──────────────────────────────────────────────────────
const SAR  = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const pSAR = (cv, pct) => (+cv||0) * (+pct||0) / 100

function trafficLight(actual, budget) {
  if (!budget || budget <= 0) return { color:'#9e9e9e', label:'NO BUDGET', bg:'#f5f5f5' }
  const r = actual / budget
  if (r < 0.70) return { color:'#2e7d32', label:'ON TRACK',  bg:'#e8f5e9' }
  if (r < 0.85) return { color:'#1565c0', label:'MONITOR',   bg:'#e3f2fd' }
  if (r < 0.95) return { color:'#e65100', label:'WARNING',   bg:'#fff3e0' }
  if (r <= 1.0)  return { color:'#c62828', label:'CRITICAL',  bg:'#ffebee' }
  return { color:'#fff', label:'OVERRUN', bg:'#b71c1c' }
}

function marginHealth(totalCostPct) {
  const margin = 100 - totalCostPct
  if (margin >= 30) return { color:'#2e7d32', bg:'#e8f5e9', label:`MARGIN ${margin.toFixed(1)}%  ✅` }
  if (margin >= 15) return { color:'#e65100', bg:'#fff3e0', label:`MARGIN ${margin.toFixed(1)}%  ⚠` }
  if (margin >= 0)  return { color:'#c62828', bg:'#ffebee', label:`MARGIN ${margin.toFixed(1)}%  🔴` }
  return { color:'#fff', bg:'#b71c1c', label:`LOSS ${Math.abs(margin).toFixed(1)}%  🚨` }
}

// ── Styles ────────────────────────────────────────────────────────
const S = {
  card:    { background:'#fff', borderRadius:12, padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', marginBottom:16 },
  inp:     { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:     (c='#8C601B', outline=false) => ({ background:outline?'transparent':c, color:outline?c:'#fff', border:outline?`2px solid ${c}`:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
  tbl:     { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:      { background:'#8C601B', color:'#fff', padding:'8px 10px', fontWeight:700, textAlign:'left', fontSize:11, textTransform:'uppercase', letterSpacing:0.5, borderBottom:'2px solid #7a5217' },
  td:      { padding:'9px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:   { background:'#fff', borderRadius:16, padding:28, width:840, maxWidth:'96vw', maxHeight:'93vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  tab:     a => ({ padding:'7px 16px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, background:a?'#5A32D4':'#f0f4f8', color:a?'#fff':'#6b7c93', marginRight:6 }),
  badge:   (c='#5A32D4') => ({ background:c+'18', color:c, padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, display:'inline-block' }),
  section: { background:'#f8f9fc', borderRadius:10, padding:'14px 16px', marginBottom:14 },
  secTitle:{ fontSize:11, fontWeight:800, color:'#6b7c93', textTransform:'uppercase', letterSpacing:1, marginBottom:12 },
  kv:      { display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:8, borderBottom:'1px solid #f0f4f8', paddingBottom:6 },
}

const EMPTY = {
  service_unit:'NISU', dept_id:'', project_id:'', contractor_id:'', pm_id:'',
  site_no:'', job_no:'', site_name:'', location:'',
  wf_code:'', uom:'Lump Sum', quantity:'',
  contractor_po:'', contractor_po_value:'', contract_value:'',
  start_date:'', end_date:'', status:'PENDING', notes:'',
  work_type:'',
  budget_team_pct:0, budget_supplier_pct:0, budget_subcon_pct:0,
  budget_food_pct:0, budget_overtime_pct:0, budget_petty_pct:0, budget_misc_pct:0,
  // keep SAR fields for backward compat (computed on save)
  budget_team_expenses:0, budget_supplier_pos:0, budget_subcon_pos:0,
  budget_food:0, budget_overtime:0, budget_petty_cash:0, budget_misc:0,
}

// ── Main Component ────────────────────────────────────────────────
export default function SiteMaster({ entityId }) {
  const [sites,       setSites]       = useState([])
  const [projects,    setProjects]    = useState([])
  const [contractors, setContractors] = useState([])
  const [employees,   setEmployees]   = useState([])
  const [depts,       setDepts]       = useState([])
  const [loading,     setLoading]     = useState(true)

  const [showBanner, setShowBanner] = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [smStep,     setSmStep]     = useState(1)
  const [detail,     setDetail]     = useState(null)
  const [detailTab,  setDetailTab]  = useState('overview')
  const [form,       setForm]       = useState(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState('')
  const [milestones, setMilestones] = useState([])
  const [savingML,   setSavingML]   = useState(false)
  const [showAllWF,  setShowAllWF]  = useState(false)

  // ── Bulk Upload ───────────────────────────────────────────────
  const [showBulk,    setShowBulk]    = useState(false)
  const [bulkRows,    setBulkRows]    = useState([])
  const [bulkImp,     setBulkImp]     = useState(false)
  const [bulkMsg,     setBulkMsg]     = useState('')

  // ── Bulk Edit (correct existing records) ─────────────────────
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [showBulkEdit,  setShowBulkEdit]  = useState(false)
  const [beFields,      setBeFields]      = useState({})   // only fields the user fills in
  const [beSaving,      setBeSaving]      = useState(false)
  const [beMsg,         setBeMsg]         = useState('')

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(s=>s.id)))
  }

  async function saveBulkEdit() {
    if (!selectedIds.size) return
    // Build update payload from only non-empty beFields
    const patch = {}
    if (beFields.status)      patch.status      = beFields.status
    if (beFields.project_id)  patch.project_id  = beFields.project_id
    if (beFields.contractor_id) patch.contractor_id = beFields.contractor_id
    if (beFields.wf_code) {
      patch.wf_code = beFields.wf_code
      const wf = WF_CODES[beFields.wf_code]
      if (wf) {
        patch.uom = wf.uom
        patch.budget_team_pct     = wf.pct.team
        patch.budget_supplier_pct = wf.pct.supplier
        patch.budget_subcon_pct   = wf.pct.subcon
        patch.budget_food_pct     = wf.pct.food
        patch.budget_overtime_pct = wf.pct.overtime
        patch.budget_petty_pct    = wf.pct.petty
        patch.budget_misc_pct     = wf.pct.misc
      }
    }
    if (beFields.work_type)   patch.work_type   = beFields.work_type
    if (beFields.start_date)  patch.start_date  = beFields.start_date
    if (beFields.end_date)    patch.end_date    = beFields.end_date
    if (beFields.dept_id) {
      patch.dept_id = beFields.dept_id
      const dept = depts.find(d=>d.id===beFields.dept_id)
      if (dept) patch.service_unit = dept.dept_code
    }
    if (!Object.keys(patch).length) { setBeMsg('No fields to update — fill in at least one field.'); return }

    // Reject if manually-entered budget % total exceeds 100
    const PCT_KEYS_BE = ['budget_team_pct','budget_supplier_pct','budget_subcon_pct','budget_food_pct','budget_overtime_pct','budget_petty_pct','budget_misc_pct']
    const manualPctTotal = PCT_KEYS_BE.reduce((a,k) => a + (+beFields[k]||0), 0)
    if (manualPctTotal > 100) {
      setBeMsg(`⛔ Total budget % = ${manualPctTotal}% — exceeds 100%. Please reduce before saving.`)
      return
    }

    // For records where we change contract_value or wf_code, recompute SAR budgets per-record
    setBeSaving(true); setBeMsg('')
    try {
      const ids = [...selectedIds]
      if (patch.budget_team_pct !== undefined) {
        // Re-compute SAR per site since each has its own contract_value
        const { data: existing } = await supabase.from('site_masters').select('id,contract_value').in('id', ids)
        const updates = (existing||[]).map(s => {
          const cv = +s.contract_value||0
          const sarOf = pct => cv * (+pct||0) / 100
          return supabase.from('site_masters').update({
            ...patch,
            budget_team_expenses: sarOf(patch.budget_team_pct),
            budget_supplier_pos:  sarOf(patch.budget_supplier_pct),
            budget_subcon_pos:    sarOf(patch.budget_subcon_pct),
            budget_food:          sarOf(patch.budget_food_pct),
            budget_overtime:      sarOf(patch.budget_overtime_pct),
            budget_petty_cash:    sarOf(patch.budget_petty_pct),
            budget_misc:          sarOf(patch.budget_misc_pct),
          }).eq('id', s.id)
        })
        await Promise.all(updates)
      } else {
        const { error } = await supabase.from('site_masters').update(patch).in('id', ids)
        if (error) throw error
      }
      setBeMsg(`✅ ${ids.length} sites updated`)
      setSelectedIds(new Set())
      await load()
      setTimeout(()=>{ setShowBulkEdit(false); setBeFields({}); setBeMsg('') }, 2000)
    } catch(e) { setBeMsg(`❌ ${e.message}`) }
    finally    { setBeSaving(false) }
  }

  const [filterProject, setFilterProject] = useState('')
  const [filterUnit,    setFilterUnit]    = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [search,        setSearch]        = useState('')
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [openMenu,    setOpenMenu]    = useState(null)
  const [showColMenu, setShowColMenu] = useState(false)
  // optional columns — toggled by user
  const [colVis, setColVis] = useState({ site_no:false, wf_code:true, contract:true, actual:false })
  function toggleCol(k) { setColVis(p=>({...p,[k]:!p[k]})) }

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:s },{ data:p },{ data:c },{ data:e },{ data:d }] = await Promise.all([
      supabase.from('site_masters').select(`
        *,
        project:project_id(project_number,project_name),
        contractor:contractor_id(contractor_name,contractor_code)
      `).eq('entity_id',entityId).order('created_at',{ascending:false}).limit(500),
      supabase.from('projects').select('id,project_number,project_name,status,contractor_id,department_id').eq('entity_id',entityId).order('project_number'),
      supabase.from('contractors').select('id,contractor_name,contractor_code').eq('entity_id',entityId).eq('vendor_type','CONTRACTOR').eq('status','ACTIVE').order('contractor_name'),
      supabase.from('employees').select('id,full_name_en,designation,department_id').eq('entity_id',entityId).eq('is_active',true).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id',entityId).eq('is_active',true).order('dept_name'),
    ])
    setSites(s||[]); setProjects(p||[]); setContractors(c||[]); setEmployees(e||[]); setDepts(d||[])
    setLoading(false)
  }

  // ── WF code helpers ──────────────────────────────────────────
  const filteredWF = useMemo(() => {
    if (showAllWF || !form.service_unit) return WF_LIST
    return WF_LIST.filter(w => w.depts.includes(form.service_unit))
  }, [form.service_unit, showAllWF])

  function onWFChange(code) {
    const wf = WF_CODES[code]
    if (!wf) { setF('wf_code', code); return }
    setForm(p => ({
      ...p,
      wf_code: code,
      uom: wf.uom,
      budget_team_pct:     wf.pct.team,
      budget_supplier_pct: wf.pct.supplier,
      budget_subcon_pct:   wf.pct.subcon,
      budget_food_pct:     wf.pct.food,
      budget_overtime_pct: wf.pct.overtime,
      budget_petty_pct:    wf.pct.petty,
      budget_misc_pct:     wf.pct.misc,
    }))
  }

  // ── Budget calc ──────────────────────────────────────────────
  const cv = +form.contract_value || 0
  const totalCostPct = BUDGET_ROWS.reduce((a, r) => a + (+form[r.pctKey]||0), 0)
  const mh = marginHealth(totalCostPct)

  // ── Department / project filters ─────────────────────────────
  function onDeptChange(deptId) {
    const dept = depts.find(d => d.id === deptId)
    setForm(p => ({ ...p, dept_id:deptId, service_unit:dept?.dept_code||'', project_id:'', pm_id:'', wf_code:'' }))
    setShowAllWF(false)
  }

  function onProjectChange(pid) {
    setF('project_id', pid)
    const proj = projects.find(p => p.id === pid)
    if (proj?.contractor_id) setF('contractor_id', proj.contractor_id)
  }

  const deptProjects  = useMemo(() => form.dept_id ? projects.filter(p => p.department_id===form.dept_id) : projects, [projects, form.dept_id])
  const deptEmployees = useMemo(() => form.dept_id ? employees.filter(e => e.department_id===form.dept_id) : employees, [employees, form.dept_id])

  // ── Save ──────────────────────────────────────────────────────
  async function nextSmId(unit) {
    const yr = new Date().getFullYear().toString().slice(2)
    const { data } = await supabase.from('site_masters').select('sm_id').like('sm_id',`SM-${unit}-${yr}-%`).order('sm_id',{ascending:false}).limit(1)
    if (!data || data.length===0) return `SM-${unit}-${yr}-001`
    const seq = parseInt(data[0].sm_id.split('-').pop()||'0') + 1
    return `SM-${unit}-${yr}-${String(seq).padStart(3,'0')}`
  }

  async function save() {
    setSaveError('')
    if (!form.dept_id)    { setSaveError('Department is required.'); return }
    if (!form.project_id) { setSaveError('Project is required — select a department first.'); return }
    setSaving(true)
    const isNew  = !editing
    const sm_id  = isNew ? await nextSmId(form.service_unit) : editing.sm_id
    const cvNum  = +form.contract_value || 0
    const wfMeta = WF_CODES[form.wf_code] || {}
    const defaultML = (wfMeta.stages||[]).map(name => ({ name, status:'PENDING', date:'', notes:'' }))

    // compute SAR values for backward compat reporting
    const sarOf = pct => cvNum * (+pct||0) / 100

    const payload = {
      entity_id:entityId, sm_id,
      service_unit:form.service_unit,
      work_type:form.work_type||null,
      wf_code:form.wf_code||null,
      uom:form.uom||'Lump Sum',
      quantity:+form.quantity||null,
      project_id:form.project_id||null,
      contractor_id:form.contractor_id||null,
      dept_id:form.dept_id||null,
      pm_id:form.pm_id||null,
      site_no:form.site_no||null,
      job_no:form.job_no||sm_id,
      site_name:form.site_name||null,
      location:form.location||null,
      contractor_po:form.contractor_po||null,
      contractor_po_value:+form.contractor_po_value||0,
      contract_value:cvNum,
      start_date:form.start_date||null,
      end_date:form.end_date||null,
      status:form.status||'PENDING',
      notes:form.notes||null,
      // percentage splits
      budget_team_pct:     +form.budget_team_pct||0,
      budget_supplier_pct: +form.budget_supplier_pct||0,
      budget_subcon_pct:   +form.budget_subcon_pct||0,
      budget_food_pct:     +form.budget_food_pct||0,
      budget_overtime_pct: +form.budget_overtime_pct||0,
      budget_petty_pct:    +form.budget_petty_pct||0,
      budget_misc_pct:     +form.budget_misc_pct||0,
      // SAR computed
      budget_team_expenses: sarOf(form.budget_team_pct),
      budget_supplier_pos:  sarOf(form.budget_supplier_pct),
      budget_subcon_pos:    sarOf(form.budget_subcon_pct),
      budget_food:          sarOf(form.budget_food_pct),
      budget_overtime:      sarOf(form.budget_overtime_pct),
      budget_petty_cash:    sarOf(form.budget_petty_pct),
      budget_misc:          sarOf(form.budget_misc_pct),
      ...(isNew ? { milestones:defaultML } : {}),
    }

    const { data:saved, error } = isNew
      ? await supabase.from('site_masters').insert(payload).select('id,sm_id')
      : await supabase.from('site_masters').update(payload).eq('id',editing.id).select('id,sm_id')
    setSaving(false)
    if (error) { setSaveError(`DB Error: ${error.message}`); return }
    if (!saved||saved.length===0) { setSaveError('Row was not saved — session may have expired.'); return }
    closeForm(); load()
  }

  function openEdit(sm) {
    setEditing(sm)
    const dept = depts.find(d => d.id===sm.dept_id)
    setForm({
      service_unit:sm.service_unit||dept?.dept_code||'',
      work_type:sm.work_type||'', wf_code:sm.wf_code||'',
      uom:sm.uom||'Lump Sum', quantity:sm.quantity||'',
      project_id:sm.project_id||'', contractor_id:sm.contractor_id||'',
      dept_id:sm.dept_id||'', pm_id:sm.pm_id||'',
      site_no:sm.site_no||'', job_no:sm.job_no||'',
      site_name:sm.site_name||'', location:sm.location||'',
      contractor_po:sm.contractor_po||'', contractor_po_value:sm.contractor_po_value||'',
      contract_value:sm.contract_value||'',
      start_date:sm.start_date||'', end_date:sm.end_date||'',
      status:sm.status||'PENDING', notes:sm.notes||'',
      budget_team_pct:     sm.budget_team_pct||0,
      budget_supplier_pct: sm.budget_supplier_pct||0,
      budget_subcon_pct:   sm.budget_subcon_pct||0,
      budget_food_pct:     sm.budget_food_pct||0,
      budget_overtime_pct: sm.budget_overtime_pct||0,
      budget_petty_pct:    sm.budget_petty_pct||0,
      budget_misc_pct:     sm.budget_misc_pct||0,
      budget_team_expenses:0, budget_supplier_pos:0, budget_subcon_pos:0,
      budget_food:0, budget_overtime:0, budget_petty_cash:0, budget_misc:0,
    })
    setSmStep(1); setShowForm(true); setShowAllWF(false)
  }

  function closeForm() { setShowForm(false); setEditing(null); setForm(EMPTY); setSaveError(''); setSmStep(1); setShowAllWF(false) }

  async function deleteSite(sm, e) {
    e.stopPropagation()
    if (!window.confirm(`Delete "${sm.sm_id} — ${sm.site_name||sm.job_no}"?\n\nThis cannot be undone.`)) return
    const { error } = await supabase.from('site_masters').delete().eq('id',sm.id)
    if (error) { alert('Delete failed: '+error.message); return }
    setSites(prev=>prev.filter(s=>s.id!==sm.id))
    if (detail?.id===sm.id) setDetail(null)
  }

  function openDetail(sm) {
    setDetail(sm)
    const ml = sm.milestones
    setMilestones(Array.isArray(ml)?ml:(typeof ml==='string'?JSON.parse(ml||'[]'):[]))
    setDetailTab('overview')
  }

  async function saveMilestones() {
    setSavingML(true)
    const { error } = await supabase.from('site_masters').update({ milestones }).eq('id',detail.id)
    setSavingML(false)
    if (error) { alert(error.message); return }
    const updated = { ...detail, milestones }
    setDetail(updated); setSites(prev=>prev.map(s=>s.id===detail.id?updated:s))
  }

  function updateML(i, field, val) {
    setMilestones(prev=>prev.map((m,idx)=>idx===i?{...m,[field]:val}:m))
  }

  async function updateStatus(sm, newStatus) {
    const { error } = await supabase.from('site_masters').update({ status:newStatus }).eq('id',sm.id)
    if (!error) {
      setSites(prev=>prev.map(s=>s.id===sm.id?{...s,status:newStatus}:s))
      if (detail?.id===sm.id) setDetail(d=>({...d,status:newStatus}))
    }
  }

  async function lockBudget() {
    if (!window.confirm(`Lock budget for ${detail.sm_id}? This cannot be undone.`)) return
    const { error } = await supabase.from('site_masters').update({ budget_locked:true, budget_locked_at:new Date().toISOString() }).eq('id',detail.id)
    if (!error) {
      const updated = { ...detail, budget_locked:true, budget_locked_at:new Date().toISOString() }
      setDetail(updated); setSites(prev=>prev.map(s=>s.id===detail.id?updated:s))
    }
  }

  function setF(field, val) { setForm(p=>({...p,[field]:val})) }

  // ── Bulk Upload helpers ──────────────────────────────────────
  const BULK_HEADERS = [
    'dept_code','project_number','wf_code','site_no','site_name',
    'location','contractor_code','contract_value',
    'start_date','end_date','status','work_type',
    'budget_team_pct','budget_supplier_pct','budget_subcon_pct',
    'budget_food_pct','budget_overtime_pct','budget_petty_pct','budget_misc_pct','notes',
  ]
  const BULK_SAMPLE = [
    'NISU','PRJ-001','WF-SFP-S','SITE-001','Main Switch Room',
    'Riyadh','CONT-001','50000',
    '2026-01-01','2026-12-31','PENDING','Installation',
    '30','15','0','10','5','3','2','Sample notes',
  ]

  function downloadBulkTemplate() {
    const csv = [BULK_HEADERS.join(','), BULK_SAMPLE.join(',')].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type:'text/csv' })),
      download: 'site_master_bulk_template.csv',
    })
    a.click()
  }

  function handleBulkFile(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      const lines = evt.target.result.split('\n').map(l=>l.trim()).filter(Boolean)
      if (lines.length < 2) { setBulkMsg('File is empty or has no data rows.'); return }
      const hdrs = lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim())
      const raw  = lines.slice(1).map(line => {
        const vals = line.split(',').map(v=>v.replace(/^"|"$/g,'').trim())
        return Object.fromEntries(hdrs.map((h,i)=>[h, vals[i]||'']))
      })
      const rows = raw.map((r, idx) => {
        const errs = []; const warns = []
        const dept       = depts.find(d => d.dept_code === r.dept_code)
        if (!dept)                                 errs.push(`Dept "${r.dept_code}" not found`)
        const project    = projects.find(p => p.project_number === r.project_number)
        if (!project)                              errs.push(`Project "${r.project_number}" not found`)
        const contractor = r.contractor_code ? contractors.find(c => c.contractor_code === r.contractor_code) : null
        if (r.contractor_code && !contractor)      errs.push(`Contractor "${r.contractor_code}" not found`)
        if (r.contract_value && isNaN(+r.contract_value)) errs.push('contract_value must be a number')
        // ── Budget % validation ──────────────────────────────────
        const PCT_KEYS = ['budget_team_pct','budget_supplier_pct','budget_subcon_pct','budget_food_pct','budget_overtime_pct','budget_petty_pct','budget_misc_pct']
        let totalPct = 0
        PCT_KEYS.forEach(k => {
          const v = r[k]
          if (v === '' || v === undefined) return
          const n = +v
          if (isNaN(n))        errs.push(`${k} is not a number`)
          else if (n < 0)      errs.push(`${k} cannot be negative (got ${n})`)
          else if (n > 100)    errs.push(`${k} cannot exceed 100% (got ${n}%)`)
          else totalPct += n
        })
        if (totalPct > 100)    errs.push(`Total budget % = ${totalPct}% — exceeds 100%`)
        else if (totalPct > 70) warns.push(`Total budget % = ${totalPct}% — margin < 30%`)
        return { ...r, _idx:idx+1, _dept:dept, _project:project, _contractor:contractor, _errs:errs, _warns:warns, _ok:errs.length===0 }
      })
      setBulkRows(rows)
      const nOk   = rows.filter(r=>r._ok).length
      const nErr  = rows.filter(r=>!r._ok).length
      const nWarn = rows.filter(r=>r._ok && r._warns?.length).length
      setBulkMsg(`${nOk} valid · ${nErr} errors · ${nWarn} margin warnings`)
    }
    reader.readAsText(file)
  }

  async function saveBulk() {
    const valid = bulkRows.filter(r=>r._ok)
    if (!valid.length) return
    setBulkImp(true); setBulkMsg('')
    try {
      // Pre-fetch max SM IDs per unit to assign sequential IDs in one pass
      const units = [...new Set(valid.map(r=>r._dept.dept_code))]
      const yr    = new Date().getFullYear().toString().slice(2)
      const seqMap = {}
      await Promise.all(units.map(async unit => {
        const { data } = await supabase.from('site_masters').select('sm_id').like('sm_id',`SM-${unit}-${yr}-%`).order('sm_id',{ascending:false}).limit(1)
        seqMap[unit] = data?.length ? parseInt(data[0].sm_id.split('-').pop()||'0') : 0
      }))
      const records = valid.map(r => {
        const unit  = r._dept.dept_code
        seqMap[unit] = (seqMap[unit]||0) + 1
        const sm_id = `SM-${unit}-${yr}-${String(seqMap[unit]).padStart(3,'0')}`
        const cvNum = +r.contract_value || 0
        const sarOf = pct => cvNum * (+pct||0) / 100
        const wfMeta   = WF_CODES[r.wf_code] || {}
        const dfltML   = (wfMeta.stages||[]).map(name=>({name,status:'PENDING',date:'',notes:''}))
        return {
          entity_id:entityId, sm_id,
          service_unit:r._dept.dept_code, dept_id:r._dept.id,
          project_id:r._project.id,
          contractor_id:r._contractor?.id||null,
          wf_code:r.wf_code||null, uom:'Lump Sum',
          site_no:r.site_no||null, job_no:r.site_no||sm_id,
          site_name:r.site_name||null, location:r.location||null,
          contract_value:cvNum, start_date:r.start_date||null, end_date:r.end_date||null,
          status:r.status||'PENDING', work_type:r.work_type||null, notes:r.notes||null,
          budget_team_pct:    +r.budget_team_pct||0,
          budget_supplier_pct:+r.budget_supplier_pct||0,
          budget_subcon_pct:  +r.budget_subcon_pct||0,
          budget_food_pct:    +r.budget_food_pct||0,
          budget_overtime_pct:+r.budget_overtime_pct||0,
          budget_petty_pct:   +r.budget_petty_pct||0,
          budget_misc_pct:    +r.budget_misc_pct||0,
          budget_team_expenses:sarOf(r.budget_team_pct),
          budget_supplier_pos: sarOf(r.budget_supplier_pct),
          budget_subcon_pos:   sarOf(r.budget_subcon_pct),
          budget_food:         sarOf(r.budget_food_pct),
          budget_overtime:     sarOf(r.budget_overtime_pct),
          budget_petty_cash:   sarOf(r.budget_petty_pct),
          budget_misc:         sarOf(r.budget_misc_pct),
          milestones:dfltML,
        }
      })
      const { error } = await supabase.from('site_masters').insert(records)
      if (error) throw error
      setBulkMsg(`✅ ${records.length} sites imported!`)
      await load()
      setTimeout(()=>{ setShowBulk(false); setBulkRows([]); setBulkMsg('') }, 2500)
    } catch(e) { setBulkMsg(`❌ ${e.message}`) }
    finally    { setBulkImp(false) }
  }

  const filtered = useMemo(() => sites
    .filter(s=>!filterProject||s.project_id===filterProject)
    .filter(s=>!filterUnit||s.service_unit===filterUnit)
    .filter(s=>!filterStatus||s.status===filterStatus)
    .filter(s=>!search||[s.sm_id,s.site_no,s.job_no,s.site_name,s.location,s.wf_code].some(f=>(f||'').toLowerCase().includes(search.toLowerCase())))
  ,[sites,filterProject,filterUnit,filterStatus,search])

  const totalBudget  = sites.reduce((a,s)=>a+(+s.budget_total||0),0)
  const totalActual  = sites.reduce((a,s)=>a+(+s.actual_total||0),0)
  const totalContract= sites.reduce((a,s)=>a+(+s.contract_value||0),0)
  const unitCounts   = UNITS.reduce((acc,u)=>({...acc,[u]:sites.filter(s=>s.service_unit===u).length}),{})

  // ── Render ────────────────────────────────────────────────────
  return (
    <div>
      {/* ══ STICKY HEADER ══ */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', paddingBottom:8, marginBottom:4 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0 6px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={()=>setHeaderCollapsed(c=>!c)} style={{ background:'none', border:'1px solid #dde3ec', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:13, color:'#6b7c93' }}>
              {headerCollapsed?'▼':'▲'}
            </button>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#1a2e3d' }}>Site Master</div>
              <div style={{ fontSize:11, color:'#6b7c93' }}>Jobs · Activities · Budget · Margin</div>
            </div>
          </div>
        </div>

        {!headerCollapsed && <>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingBottom:6 }}>
            {[
              { label:'Total',        val:sites.length,                                                              color:'#5A32D4', bg:'#ede7f6' },
              { label:'In Progress',  val:sites.filter(s=>s.status==='IN_PROGRESS').length,                          color:'#e65100', bg:'#fff3e0' },
              { label:'Completed',    val:sites.filter(s=>['COMPLETED','SNAGGING','HANDED_OVER'].includes(s.status)).length, color:'#2e7d32', bg:'#e8f5e9' },
              { label:'Invoiced',     val:sites.filter(s=>s.status==='INVOICED').length,                              color:'#1a237e', bg:'#e8eaf6' },
              { label:'Contract',     val:SAR(totalContract),                                                         color:'#00695c', bg:'#e0f2f1' },
              { label:'Budget Cost',  val:SAR(totalBudget),                                                           color:'#1565c0', bg:'#e3f2fd' },
              { label:'Actual',       val:SAR(totalActual),                                                           color:totalActual>totalBudget?'#c62828':'#2e7d32', bg:totalActual>totalBudget?'#ffebee':'#e8f5e9' },
            ].map(k=>(
              <div key={k.label} style={{ background:`linear-gradient(135deg,${k.color}cc 0%,${k.color} 100%)`, borderRadius:10, padding:'10px 14px', flexShrink:0, minWidth:90, boxShadow:`0 3px 10px ${k.color}44` }}>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:0.8 }}>{k.label}</div>
                <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{k.val}</div>
              </div>
            ))}
            {UNITS.map(u=>(
              <div key={u} style={{ background:'linear-gradient(135deg,#7e57c2cc 0%,#5A32D4 100%)', borderRadius:10, padding:'10px 14px', flexShrink:0, minWidth:70, boxShadow:'0 3px 10px #5A32D444', textAlign:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.85)', textTransform:'uppercase', letterSpacing:0.8 }}>{u}</div>
                <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{unitCounts[u]||0}</div>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', paddingBottom:6 }}>
            <input style={{ ...S.inp, maxWidth:200 }} placeholder="Search SM#, Site#, Job#, Name…" value={search} onChange={e=>setSearch(e.target.value)} />
            <select style={{ ...S.inp, maxWidth:230 }} value={filterProject} onChange={e=>setFilterProject(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map(p=><option key={p.id} value={p.id}>[{p.project_number}] {p.project_name}</option>)}
            </select>
            <select style={{ ...S.inp, maxWidth:120 }} value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}>
              <option value="">All Units</option>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </select>
            <select style={{ ...S.inp, maxWidth:160 }} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
            <span style={{ fontSize:11, color:'#6b7c93' }}>{filtered.length} sites</span>
            {/* Columns toggle */}
            <div style={{ position:'relative', marginLeft:4 }}>
              <button onClick={()=>setShowColMenu(v=>!v)}
                style={{ background:'#f0f4f8', border:'1px solid #dde3ec', borderRadius:7, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', color:'#6b7c93' }}>
                Columns ▾
              </button>
              {showColMenu && (
                <div style={{ position:'absolute', top:'110%', left:0, background:'#fff', border:'1px solid #e0e7ef', borderRadius:10, boxShadow:'0 6px 20px rgba(0,0,0,0.12)', zIndex:50, minWidth:160, padding:'8px 0' }}
                  onClick={e=>e.stopPropagation()}>
                  {[
                    { key:'site_no',   label:'Site#'    },
                    { key:'wf_code',   label:'WF Code'  },
                    { key:'contract',  label:'Contract' },
                    { key:'actual',    label:'Actual'   },
                  ].map(c=>(
                    <label key={c.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 14px', cursor:'pointer', fontSize:13, color:'#1a2e3d' }}>
                      <input type="checkbox" checked={!!colVis[c.key]} onChange={()=>toggleCol(c.key)} style={{ cursor:'pointer' }} />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8, marginLeft:'auto', alignItems:'center' }}>
              {selectedIds.size > 0 && (
                <button style={{ ...S.btn('#c62828'), padding:'10px 16px', boxShadow:'0 3px 8px rgba(198,40,40,0.30)', animation:'none' }}
                  onClick={()=>{ setBeFields({}); setBeMsg(''); setShowBulkEdit(true) }}>
                  ✏️ Bulk Edit ({selectedIds.size})
                </button>
              )}
              <button style={{ ...S.btn('#5A32D4'), padding:'10px 16px', boxShadow:'0 3px 8px rgba(90,50,212,0.30)' }}
                onClick={()=>{ setBulkRows([]); setBulkMsg(''); setShowBulk(true) }}>
                ⬆ Bulk Upload
              </button>
              <button style={{ ...S.btn(), padding:'10px 0', minWidth:160, textAlign:'center', boxShadow:'0 3px 8px rgba(140,96,27,0.35)' }}
                onClick={()=>{ setEditing(null); setForm(EMPTY); setSmStep(1); setShowBanner(true) }}>
                + New Site
              </button>
            </div>
          </div>
        </>}
      </div>

      {/* ── Table ── */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }} onClick={()=>{ setOpenMenu(null); setShowColMenu(false) }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
        <table style={S.tbl}>
          <thead><tr>
            <th style={{ ...S.th, width:36, textAlign:'center' }}>
              <input type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={toggleSelectAll}
                style={{ cursor:'pointer', width:14, height:14, accentColor:'#fff' }} />
            </th>
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>SM ID</th>
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>Unit</th>
            {colVis.site_no   && <th style={{ ...S.th, whiteSpace:'nowrap' }}>Site#</th>}
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>Job#</th>
            <th style={S.th}>Site Name</th>
            {colVis.wf_code   && <th style={{ ...S.th, whiteSpace:'nowrap' }}>WF Code</th>}
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>Status</th>
            {colVis.contract  && <th style={{ ...S.th, textAlign:'right', whiteSpace:'nowrap' }}>Contract</th>}
            {colVis.actual    && <th style={{ ...S.th, textAlign:'right', whiteSpace:'nowrap' }}>Actual</th>}
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>Health</th>
            <th style={{ ...S.th, width:40 }}></th>
          </tr></thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={11} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:40 }}>
                No sites yet — click "+ New Site" to add one
              </td></tr>
            )}
            {filtered.map((sm,i)=>{
              const tl = trafficLight(+sm.actual_total||0, +sm.budget_total||0)
              const nw = { whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }
              const isSel = selectedIds.has(sm.id)
              return (
                <tr key={sm.id} style={{ background: isSel ? '#fff3e0' : i%2===0?'#fff':'#fafbfc', cursor:'pointer', outline: isSel ? '2px solid #8C601B' : 'none', outlineOffset:'-1px' }} onClick={()=>openDetail(sm)}>
                  <td style={{ ...S.td, textAlign:'center', padding:'8px 6px' }} onClick={e=>{ e.stopPropagation(); toggleSelect(sm.id) }}>
                    <input type="checkbox" checked={isSel} readOnly
                      style={{ cursor:'pointer', width:14, height:14, accentColor:'#8C601B', pointerEvents:'none' }} />
                  </td>
                  <td style={{ ...S.td, ...nw, fontWeight:800, color:'#5A32D4', fontFamily:'monospace', fontSize:12 }}>{sm.sm_id}</td>
                  <td style={{ ...S.td, ...nw }}><span style={S.badge()}>{sm.service_unit}</span></td>
                  {colVis.site_no  && <td style={{ ...S.td, ...nw, fontFamily:'monospace', fontSize:11, color:'#1565c0' }}>{sm.site_no||'—'}</td>}
                  <td style={{ ...S.td, ...nw, fontFamily:'monospace', fontSize:11 }}>{sm.job_no||'—'}</td>
                  <td style={{ ...S.td, fontSize:12, maxWidth:200, ...nw }}>{sm.site_name||'—'}</td>
                  {colVis.wf_code  && <td style={{ ...S.td, ...nw }}>{sm.wf_code?<span style={{ ...S.badge('#00695c'), fontSize:10 }}>{sm.wf_code}</span>:'—'}</td>}
                  <td style={{ ...S.td, ...nw }}>
                    <span style={{ background:(STATUS_COLORS[sm.status]||'#9e9e9e')+'18', color:STATUS_COLORS[sm.status]||'#9e9e9e', padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700 }}>
                      {(sm.status||'PENDING').replace(/_/g,' ')}
                    </span>
                  </td>
                  {colVis.contract && <td style={{ ...S.td, ...nw, textAlign:'right', fontSize:11, fontWeight:700 }}>{+sm.contract_value>0?SAR(sm.contract_value):'—'}</td>}
                  {colVis.actual   && <td style={{ ...S.td, ...nw, textAlign:'right', fontSize:11 }}>{+sm.actual_total>0?SAR(sm.actual_total):'—'}</td>}
                  <td style={{ ...S.td, ...nw }}><span style={{ background:tl.bg, color:tl.color, padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700 }}>{tl.label}</span></td>
                  <td style={{ ...S.td, width:40, textAlign:'center' }} onClick={e=>e.stopPropagation()}>
                    <div style={{ position:'relative', display:'inline-block' }}>
                      <button style={{ background:'none', border:'1px solid #dde3ec', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:16, color:'#6b7c93', lineHeight:1 }}
                        onClick={e=>{ e.stopPropagation(); setOpenMenu(openMenu===sm.id?null:sm.id) }}>⋯</button>
                      {openMenu===sm.id && (
                        <div style={{ position:'absolute', right:0, top:'100%', background:'#fff', border:'1px solid #e0e7ef', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', zIndex:100, minWidth:110, overflow:'hidden' }}
                          onClick={e=>e.stopPropagation()}>
                          <button style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', textAlign:'left', cursor:'pointer', fontSize:13, color:'#1a2e3d' }}
                            onMouseOver={e=>e.target.style.background='#f0f4f8'} onMouseOut={e=>e.target.style.background='none'}
                            onClick={()=>{ setOpenMenu(null); openEdit(sm) }}>✏ Edit</button>
                          <button style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', textAlign:'left', cursor:'pointer', fontSize:13, color:'#c62828' }}
                            onMouseOver={e=>e.target.style.background='#ffebee'} onMouseOut={e=>e.target.style.background='none'}
                            onClick={e=>{ setOpenMenu(null); deleteSite(sm,e) }}>🗑 Delete</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        )}
      </div>

      {/* ── PageBanner ── */}
      <PageBanner
        isOpen={showBanner} onClose={()=>setShowBanner(false)}
        onStart={()=>{ setShowBanner(false); setSmStep(1); setShowForm(true) }}
        chapterL1="#C8B48F" chapterL2="#FAF5E9" moduleColor="#8C601B"
        chapterLabel="Masters"
        formTitle={['New','Site','Creation']}
        steps={['Project & Work Type','Site Identity','Team & Commercial','Budget & Margin']}
        icon="🏗"
        description="Create site records with WF code, activity template, and percentage-based budget. Tracks real margin per job."
      />

      {/* ══ CREATE / EDIT MODAL ══ */}
      {showForm && (() => {
        const PP  = "'Poppins','Inter',sans-serif"
        const PRI = '#8C601B'
        const L1  = '#C8B48F'
        const L2  = '#FAF5E9'
        const STEP_NAMES = ['','Project & Work Type','Site Identity','Team & Commercial','Budget & Margin']
        const STEP_DESC  = ['','Department, project & workflow code','Site#, Job#, name, location & dates','Contractor, PM, PO reference & contract value','Percentage-based cost budget with live margin']
        const inp3 = (ex={}) => ({ width:'100%', padding:'8px 12px', borderRadius:20, border:`1px solid ${PRI}44`, fontSize:12, color:'#172D37', background:'#fdfaf6', outline:'none', fontFamily:PP, boxSizing:'border-box', ...ex })
        const sec3 = { fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:`1.5px solid ${PRI}33` }
        const lbl3 = { display:'block', fontSize:11, fontWeight:600, color:'#53666F', marginBottom:4 }
        const row3 = { display:'flex', gap:10, marginBottom:10, flexWrap:'wrap' }
        const col3 = { flex:1, minWidth:100 }
        const col2 = { flex:'0 0 calc(50% - 5px)' }
        const showQty = form.uom==='Per Node' || form.uom==='Per KM'

        return (
          <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&closeForm()}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');`}</style>
            <div style={{ width:880, maxWidth:'calc(100vw - 24px)', borderRadius:18, overflow:'hidden', boxShadow:'0 28px 64px rgba(0,0,0,0.32)', fontFamily:PP, background:L1, padding:8 }}>
              <div style={{ background:L2, borderRadius:12, display:'flex', minHeight:580, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, right:0, width:'55%', height:'36%', background:PRI, borderRadius:'0 12px 0 90px', zIndex:1 }} />

                {/* Sidebar */}
                <div style={{ width:210, flexShrink:0, padding:'20px 16px 16px', display:'flex', flexDirection:'column', fontFamily:PP, position:'relative', zIndex:2 }}>
                  <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.8, textTransform:'uppercase', marginBottom:3 }}>Ratal Advanced Technologies</div>
                  <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.8, textTransform:'uppercase', marginBottom:16 }}><strong>Masters</strong></div>
                  <div style={{ fontSize:24, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6 }}>{STEP_NAMES[smStep]}</div>
                  <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[smStep]}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1, marginBottom:14 }}>STEP {smStep} OF 4</div>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                    {['Project & Work Type','Site Identity','Team & Commercial','Budget & Margin'].map((name,idx)=>{
                      const sn=idx+1, isAct=smStep===sn, isDone=smStep>sn
                      return (
                        <div key={sn} onClick={()=>isDone&&setSmStep(sn)} style={{ display:'flex', alignItems:'center', padding:'7px 0 7px 12px', cursor:isDone?'pointer':'default', borderLeft:isAct?`3px solid ${PRI}`:isDone?`3px solid ${PRI}55`:'3px solid rgba(0,0,0,0.08)' }}>
                          <span style={{ fontSize:11, fontWeight:isAct?700:500, color:isAct?'#172D37':isDone?PRI:'#b09070' }}>{name}</span>
                          {isDone && <span style={{ marginLeft:6, fontSize:10, color:PRI }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>
                  {editing && <div style={{ background:`${PRI}18`, borderRadius:8, padding:'8px 10px', marginTop:10, fontSize:10, color:PRI, fontWeight:700 }}>✏️ Editing: {editing.sm_id}</div>}
                  {/* Live margin preview in sidebar */}
                  {smStep===4 && cv > 0 && (
                    <div style={{ background:mh.bg, borderRadius:8, padding:'8px 10px', marginTop:8, fontSize:11, color:mh.color, fontWeight:700, textAlign:'center' }}>
                      {mh.label}<br/>
                      <span style={{ fontSize:10, fontWeight:500 }}>{SAR(cv*(100-totalCostPct)/100)}</span>
                    </div>
                  )}
                </div>

                {/* White card */}
                <div style={{ position:'absolute', top:22, right:22, bottom:22, left:248, background:'#fff', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:`0 6px 24px ${PRI}22`, zIndex:3 }}>
                  {/* Card header */}
                  <div style={{ padding:'18px 22px 0', flexShrink:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:17, fontWeight:700, color:'#172D37' }}>{STEP_NAMES[smStep]}</div>
                        {editing && <div style={{ fontSize:11, color:PRI, fontWeight:700, marginTop:2 }}>{editing.sm_id}</div>}
                      </div>
                      <button onClick={closeForm} style={{ background:`${PRI}18`, border:'none', color:PRI, borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                    </div>
                    <div style={{ height:1, background:`${PRI}22` }} />
                  </div>

                  {/* Scrollable form body */}
                  <div style={{ flex:1, overflowY:'auto', padding:'14px 22px 10px', fontFamily:PP }}>

                    {/* ── STEP 1: Project & Work Type ── */}
                    {smStep===1 && <>
                      <div style={sec3}>Department &amp; Project</div>
                      <div style={row3}>
                        <div style={col2}>
                          <label style={lbl3}>Department *</label>
                          <select style={inp3()} value={form.dept_id} onChange={e=>onDeptChange(e.target.value)}>
                            <option value="">Select department…</option>
                            {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
                          </select>
                        </div>
                        <div style={col2}>
                          <label style={lbl3}>Status</label>
                          <select style={inp3()} value={form.status} onChange={e=>setF('status',e.target.value)}>
                            {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <label style={lbl3}>Project *{form.dept_id&&(deptProjects.length===0?<span style={{ color:'#c62828', fontWeight:400, textTransform:'none', marginLeft:6 }}>⚠ no projects in this dept</span>:<span style={{ color:PRI, fontWeight:400, textTransform:'none', marginLeft:6 }}>({deptProjects.length} available)</span>)}</label>
                        <select style={inp3()} value={form.project_id} onChange={e=>onProjectChange(e.target.value)} disabled={!form.dept_id}>
                          <option value="">{!form.dept_id?'Select department first…':deptProjects.length===0?'No projects for this dept':'Select project…'}</option>
                          {deptProjects.map(p=><option key={p.id} value={p.id}>[{p.project_number}] {p.project_name}</option>)}
                        </select>
                      </div>

                      <div style={sec3}>Work Type / WF Code</div>
                      <div style={{ marginBottom:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                          <label style={{ ...lbl3, marginBottom:0 }}>Workflow Code</label>
                          <button onClick={()=>setShowAllWF(v=>!v)} style={{ background:'none', border:`1px solid ${PRI}55`, borderRadius:12, padding:'2px 10px', fontSize:10, color:PRI, cursor:'pointer', fontWeight:700 }}>
                            {showAllWF?'Show Dept Only':'Show All Codes'}
                          </button>
                        </div>
                        <select style={inp3()} value={form.wf_code} onChange={e=>onWFChange(e.target.value)}>
                          <option value="">Select workflow code…</option>
                          {filteredWF.map(w=>(
                            <option key={w.code} value={w.code}>[{w.code}] {w.label} — {w.uom}</option>
                          ))}
                        </select>
                        {form.wf_code && WF_CODES[form.wf_code] && (
                          <div style={{ marginTop:6, fontSize:11, color:'#6b7c93', background:'#f8f9fc', borderRadius:8, padding:'8px 12px' }}>
                            <strong style={{ color:PRI }}>Activities ({WF_CODES[form.wf_code].stages.length} stages):</strong>{' '}
                            {WF_CODES[form.wf_code].stages.join(' → ')}
                          </div>
                        )}
                      </div>

                      {showQty && (
                        <div style={row3}>
                          <div style={col2}>
                            <label style={lbl3}>Unit of Measure</label>
                            <input style={inp3({ background:'#f5f5f5' })} value={form.uom} readOnly />
                          </div>
                          <div style={col2}>
                            <label style={lbl3}>Quantity ({form.uom==='Per KM'?'KM':'Nodes'})</label>
                            <input type="number" style={inp3()} value={form.quantity} onChange={e=>setF('quantity',e.target.value)} placeholder="0" />
                          </div>
                        </div>
                      )}
                    </>}

                    {/* ── STEP 2: Site Identity ── */}
                    {smStep===2 && <>
                      <div style={sec3}>Site Reference</div>
                      <div style={row3}>
                        <div style={col2}>
                          <label style={lbl3}>Site#</label>
                          <input style={inp3()} value={form.site_no} onChange={e=>setF('site_no',e.target.value)} placeholder="Physical location ref" />
                        </div>
                        <div style={col2}>
                          <label style={lbl3}>Job#</label>
                          <input style={inp3()} value={form.job_no} onChange={e=>setF('job_no',e.target.value)} placeholder="Work order / client job ref" />
                        </div>
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <label style={lbl3}>Site Name</label>
                        <input style={inp3()} value={form.site_name} onChange={e=>setF('site_name',e.target.value)} placeholder="e.g. Al Nakheel Tower, Floor 3 East Wing" />
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <label style={lbl3}>Location</label>
                        <input style={inp3()} value={form.location} onChange={e=>setF('location',e.target.value)} placeholder="City / Area / Address" />
                      </div>
                      <div style={row3}>
                        <div style={col2}>
                          <label style={lbl3}>Start Date</label>
                          <input type="date" style={inp3()} value={form.start_date} onChange={e=>setF('start_date',e.target.value)} />
                        </div>
                        <div style={col2}>
                          <label style={lbl3}>End Date</label>
                          <input type="date" style={inp3()} value={form.end_date} onChange={e=>setF('end_date',e.target.value)} />
                        </div>
                      </div>
                    </>}

                    {/* ── STEP 3: Team & Commercial ── */}
                    {smStep===3 && <>
                      <div style={sec3}>Team Assignment</div>
                      <div style={row3}>
                        <div style={col3}>
                          <label style={lbl3}>Contractor</label>
                          <select style={inp3()} value={form.contractor_id} onChange={e=>setF('contractor_id',e.target.value)}>
                            <option value="">Select…</option>
                            {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_code?`[${c.contractor_code}] `:''}{c.contractor_name}</option>)}
                          </select>
                        </div>
                        <div style={col3}>
                          <label style={lbl3}>Project Manager{form.dept_id&&deptEmployees.length===0&&<span style={{ color:'#c62828', fontWeight:400, textTransform:'none', marginLeft:6 }}>⚠ no employees</span>}</label>
                          <select style={inp3()} value={form.pm_id} onChange={e=>setF('pm_id',e.target.value)} disabled={!form.dept_id}>
                            <option value="">{!form.dept_id?'Select dept first…':'Select PM…'}</option>
                            {deptEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={sec3}>Commercial Reference</div>
                      <div style={row3}>
                        <div style={{ flex:2 }}>
                          <label style={lbl3}>Contractor PO Reference</label>
                          <input style={inp3()} value={form.contractor_po} onChange={e=>setF('contractor_po',e.target.value)} placeholder="PO number from contractor" />
                        </div>
                        <div style={col3}>
                          <label style={lbl3}>PO Value (SAR)</label>
                          <input type="number" style={inp3()} value={form.contractor_po_value} onChange={e=>setF('contractor_po_value',e.target.value)} placeholder="0.00" />
                        </div>
                      </div>
                      <div style={{ marginBottom:12 }}>
                        <label style={{ ...lbl3, color:'#2e7d32', fontSize:12 }}>Contract Value (SAR) — Revenue anchor for budget *</label>
                        <input type="number" style={inp3({ background:'#f6fbf6', border:`1.5px solid #2e7d3255`, fontSize:15, fontWeight:700 })}
                          value={form.contract_value} onChange={e=>setF('contract_value',e.target.value)} placeholder="Enter contract / PO line value" />
                        {+form.contract_value>0 && (
                          <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>
                            30% margin target → Max cost: <strong style={{ color:'#e65100' }}>{SAR(+form.contract_value*0.70)}</strong>
                          </div>
                        )}
                      </div>
                    </>}

                    {/* ── STEP 4: Budget & Margin ── */}
                    {smStep===4 && <>
                      {/* Contract value reminder */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#e8f5e9', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
                        <div>
                          <div style={{ fontSize:10, color:'#2e7d32', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>Contract Value</div>
                          <div style={{ fontSize:20, fontWeight:900, color:'#172D37' }}>{SAR(cv)}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>Max Cost (70%)</div>
                          <div style={{ fontSize:16, fontWeight:800, color:'#e65100' }}>{SAR(cv*0.70)}</div>
                        </div>
                      </div>

                      {/* Budget table */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <div style={{ ...sec3, marginBottom:0, marginTop:0 }}>Budget Allocation</div>
                        {editing?.budget_locked && <span style={{ background:'#e8f5e9', color:'#2e7d32', borderRadius:6, padding:'2px 10px', fontSize:10, fontWeight:800 }}>🔒 LOCKED</span>}
                      </div>

                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:10 }}>
                        <thead>
                          <tr>
                            <th style={{ ...S.th, borderRadius:'6px 0 0 0' }}>Category</th>
                            <th style={{ ...S.th, textAlign:'center', width:90 }}>% of Contract</th>
                            <th style={{ ...S.th, textAlign:'right', borderRadius:'0 6px 0 0' }}>SAR Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {BUDGET_ROWS.map(r => {
                            const pct = +form[r.pctKey] || 0
                            const sar = pSAR(cv, pct)
                            return (
                              <tr key={r.key}>
                                <td style={S.td}>
                                  <div style={{ fontWeight:600 }}>{r.label}</div>
                                  {r.note && <div style={{ fontSize:10, color:'#9e9e9e' }}>{r.note}</div>}
                                </td>
                                <td style={{ ...S.td, textAlign:'center' }}>
                                  <input type="number" min="0" max="100" step="0.5"
                                    style={{ width:60, padding:'4px 6px', borderRadius:8, border:`1px solid ${PRI}44`, textAlign:'center', fontSize:12, background:editing?.budget_locked?'#f5f5f5':'#fdfaf6', outline:'none' }}
                                    value={pct || ''} placeholder="0"
                                    disabled={!!editing?.budget_locked}
                                    onChange={e => setF(r.pctKey, e.target.value)}
                                  />
                                  <span style={{ fontSize:11, color:'#6b7c93', marginLeft:2 }}>%</span>
                                </td>
                                <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:700, color:sar>0?'#172D37':'#bbb' }}>
                                  {cv>0 ? SAR(sar) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background:'#fff3e0' }}>
                            <td style={{ ...S.td, fontWeight:800 }}>Total Cost</td>
                            <td style={{ ...S.td, textAlign:'center', fontWeight:800, color: totalCostPct>70?'#c62828':totalCostPct>60?'#e65100':'#2e7d32' }}>
                              {totalCostPct.toFixed(1)}%
                            </td>
                            <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{cv>0?SAR(cv*totalCostPct/100):'—'}</td>
                          </tr>
                          <tr style={{ background:mh.bg }}>
                            <td style={{ ...S.td, fontWeight:900, color:mh.color }}>MARGIN</td>
                            <td style={{ ...S.td, textAlign:'center', fontWeight:900, color:mh.color }}>{(100-totalCostPct).toFixed(1)}%</td>
                            <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:900, color:mh.color }}>{cv>0?SAR(cv*(100-totalCostPct)/100):'—'}</td>
                          </tr>
                        </tfoot>
                      </table>

                      {totalCostPct>70 && (
                        <div style={{ background:'#ffebee', border:'1px solid #ef9a9a', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#c62828', fontWeight:700 }}>
                          ⚠ Cost allocation exceeds 70% — margin drops below 30% target. Adjust percentages.
                        </div>
                      )}
                      {totalCostPct>100 && (
                        <div style={{ background:'#b71c1c', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#fff', fontWeight:700 }}>
                          🚨 Cost exceeds 100% — this job will be a LOSS. Review budget immediately.
                        </div>
                      )}

                      <div style={sec3}>Notes</div>
                      <textarea style={{ ...inp3(), minHeight:55, resize:'vertical', borderRadius:10 }} value={form.notes} onChange={e=>setF('notes',e.target.value)} placeholder="Site-specific notes…" />
                      {saveError && <div style={{ background:'#ffebee', border:'1px solid #ef9a9a', borderRadius:8, padding:'8px 12px', marginTop:8, color:'#c62828', fontSize:12 }}>⚠ {saveError}</div>}
                    </>}

                  </div>

                  {/* Footer */}
                  <div style={{ flexShrink:0, padding:'11px 22px 14px', borderTop:`1px solid ${PRI}22`, display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:PP }}>
                    <button onClick={smStep===1?closeForm:()=>setSmStep(s=>s-1)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:24, padding:'9px 24px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                      {smStep===1?'Cancel':'Back'}
                    </button>
                    <span style={{ fontSize:10, color:'#53666F' }}>Step {smStep} of 4</span>
                    {smStep<4
                      ? <button onClick={()=>setSmStep(s=>s+1)} style={{ background:PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:`0 4px 14px ${PRI}44` }}>Save &amp; Next</button>
                      : <button onClick={save} disabled={saving} style={{ background:saving?'#c7c7c7':PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:700, boxShadow:saving?'none':`0 4px 14px ${PRI}44` }}>
                          {saving?'Saving…':editing?'✓ Update Site':'✓ Create Site'}
                        </button>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ DETAIL MODAL ══ */}
      {detail && (
        <div style={S.overlay} onClick={()=>setDetail(null)}>
          <div style={{ ...S.modal, width:940 }} onClick={e=>e.stopPropagation()}>
            {/* Detail Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:'#5A32D4', fontFamily:'monospace' }}>{detail.sm_id}</div>
                <div style={{ fontSize:14, color:'#1a2e3d', fontWeight:600, marginTop:2 }}>{detail.site_name||detail.job_no}</div>
                <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center' }}>
                  {detail.wf_code && <span style={{ ...S.badge('#00695c'), fontSize:10 }}>{detail.wf_code}</span>}
                  {detail.site_no && <span style={{ fontSize:11, color:'#6b7c93' }}>Site: <strong>{detail.site_no}</strong></span>}
                  {detail.job_no  && <span style={{ fontSize:11, color:'#6b7c93' }}>Job: <strong>{detail.job_no}</strong></span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <select style={{ ...S.inp, maxWidth:210, fontSize:12 }} value={detail.status} onChange={e=>updateStatus(detail,e.target.value)}>
                  {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                </select>
                <button style={{ ...S.btn(), padding:'7px 14px', fontSize:12 }} onClick={()=>{ setDetail(null); openEdit(detail) }}>Edit</button>
                <button style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#6b7c93' }} onClick={()=>setDetail(null)}>✕</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ marginBottom:20 }}>
              {['overview','milestones','budget','completions'].map(t=>(
                <button key={t} style={S.tab(detailTab===t)} onClick={()=>setDetailTab(t)}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Tab: OVERVIEW ── */}
            {detailTab==='overview' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div style={S.section}>
                  <div style={S.secTitle}>Site Details</div>
                  {[
                    ['SM ID',       detail.sm_id],
                    ['Service Unit',detail.service_unit],
                    ['WF Code',     detail.wf_code||'—'],
                    ['Site#',       detail.site_no||'—'],
                    ['Job#',        detail.job_no||'—'],
                    ['Site Name',   detail.site_name||'—'],
                    ['Location',    detail.location||'—'],
                    ['UOM',         detail.uom||'—'],
                    ['Quantity',    detail.quantity||'—'],
                    ['Start Date',  fmt(detail.start_date)],
                    ['End Date',    fmt(detail.end_date)],
                  ].map(([l,v])=>(
                    <div key={l} style={S.kv}>
                      <span style={{ color:'#6b7c93', fontWeight:600 }}>{l}</span>
                      <span style={{ fontWeight:700, color:'#1a2e3d' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={S.section}>
                    <div style={S.secTitle}>Team</div>
                    {[
                      ['Contractor', detail.contractor?.contractor_name||'—'],
                      ['Department', (()=>{ const d=depts.find(d=>d.id===detail.dept_id); return d?`[${d.dept_code}] ${d.dept_name}`:'—' })()],
                      ['Project Manager', employees.find(e=>e.id===detail.pm_id)?.full_name_en||'—'],
                    ].map(([l,v])=>(
                      <div key={l} style={S.kv}><span style={{ color:'#6b7c93', fontWeight:600 }}>{l}</span><span style={{ fontWeight:700 }}>{v}</span></div>
                    ))}
                  </div>
                  <div style={S.section}>
                    <div style={S.secTitle}>Commercial</div>
                    {[
                      ['Contractor PO',   detail.contractor_po||'—'],
                      ['PO Value',         +detail.contractor_po_value>0?SAR(detail.contractor_po_value):'—'],
                      ['Contract Value',   +detail.contract_value>0?SAR(detail.contract_value):'—'],
                      ['Invoiced Amount',  SAR(detail.invoiced_amount||0)],
                    ].map(([l,v])=>(
                      <div key={l} style={S.kv}><span style={{ color:'#6b7c93', fontWeight:600 }}>{l}</span><span style={{ fontWeight:700 }}>{v}</span></div>
                    ))}
                  </div>
                  {/* Margin summary card */}
                  {+detail.contract_value>0 && (()=>{
                    const cv2  = +detail.contract_value
                    const cost = BUDGET_ROWS.reduce((a,r)=>a+(cv2*(+detail[r.pctKey]||0)/100),0)
                    const margin = cv2 - cost
                    const mPct = ((margin/cv2)*100).toFixed(1)
                    const mhD = marginHealth(100 - +mPct)
                    return (
                      <div style={{ background:mhD.bg, borderRadius:10, padding:'12px 16px' }}>
                        <div style={S.secTitle}>Margin Summary</div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                          <div><div style={{ fontSize:10, color:'#6b7c93' }}>REVENUE</div><div style={{ fontWeight:800 }}>{SAR(cv2)}</div></div>
                          <div><div style={{ fontSize:10, color:'#6b7c93' }}>BUDGET COST</div><div style={{ fontWeight:800 }}>{SAR(cost)}</div></div>
                          <div><div style={{ fontSize:10, color:mhD.color }}>MARGIN</div><div style={{ fontWeight:900, color:mhD.color }}>{mPct}%</div></div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                {detail.notes && (
                  <div style={{ ...S.section, gridColumn:'1 / -1' }}>
                    <div style={S.secTitle}>Notes</div>
                    <div style={{ fontSize:12, color:'#1a2e3d', lineHeight:1.7 }}>{detail.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: MILESTONES ── */}
            {detailTab==='milestones' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div style={{ fontSize:12, color:'#6b7c93' }}>
                    {milestones.filter(m=>m.status==='COMPLETED').length} / {milestones.length} stages completed
                    {detail.wf_code && <span style={{ marginLeft:8, ...S.badge('#00695c'), fontSize:10 }}>{detail.wf_code}</span>}
                  </div>
                  <button style={S.btn()} onClick={saveMilestones} disabled={savingML}>{savingML?'Saving…':'Save Progress'}</button>
                </div>
                {milestones.length===0 && (
                  <div style={{ color:'#aab2bd', fontSize:13, textAlign:'center', padding:30 }}>
                    No stages — select a WF Code when editing this site to load the activity template
                  </div>
                )}
                {milestones.map((m,i)=>(
                  <div key={i} style={{ ...S.section, display:'flex', gap:12, alignItems:'flex-start', marginBottom:8, padding:'12px 14px' }}>
                    <div style={{ minWidth:28, paddingTop:2, fontSize:18 }}>
                      {m.status==='COMPLETED'?'✅':m.status==='IN_PROGRESS'?'🔄':m.status==='BLOCKED'?'🚫':'⬜'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#1a2e3d', marginBottom:8 }}>{i+1}. {m.name}</div>
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                        <select style={{ ...S.inp, maxWidth:160, fontSize:12 }} value={m.status} onChange={e=>updateML(i,'status',e.target.value)}>
                          {['PENDING','IN_PROGRESS','COMPLETED','BLOCKED'].map(s=><option key={s}>{s}</option>)}
                        </select>
                        <input type="date" style={{ ...S.inp, maxWidth:140, fontSize:12 }} value={m.date||''} onChange={e=>updateML(i,'date',e.target.value)} />
                        <input style={{ ...S.inp, fontSize:12, flex:1 }} value={m.notes||''} placeholder="Notes…" onChange={e=>updateML(i,'notes',e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab: BUDGET ── */}
            {detailTab==='budget' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={S.badge(detail.budget_locked?'#2e7d32':'#e65100')}>
                      {detail.budget_locked?'🔒 Budget Locked':'🔓 Budget Open'}
                    </span>
                    {detail.budget_locked_at && <span style={{ fontSize:11, color:'#6b7c93' }}>Locked {fmt(detail.budget_locked_at)}</span>}
                  </div>
                  {!detail.budget_locked && <button style={S.btn('#c62828')} onClick={lockBudget}>Lock Budget</button>}
                </div>

                {/* Contract value header */}
                {+detail.contract_value>0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
                    {[
                      { l:'Contract Value', v:SAR(detail.contract_value), c:'#2e7d32' },
                      { l:'Budget Cost', v:SAR(BUDGET_ROWS.reduce((a,r)=>a+(+detail.contract_value*(+detail[r.pctKey]||0)/100),0)), c:'#1565c0' },
                      { l:'Budget Margin', v:(()=>{ const tc=BUDGET_ROWS.reduce((a,r)=>a+(+detail[r.pctKey]||0),0); const mh2=marginHealth(tc); return <span style={{ color:mh2.color }}>{(100-tc).toFixed(1)}%  {mh2.label.split('%')[1]?.trim()}</span> })(), c:'#172D37' },
                    ].map(x=>(
                      <div key={x.l} style={{ background:'#f8f9fc', borderRadius:8, padding:'10px 14px' }}>
                        <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>{x.l}</div>
                        <div style={{ fontSize:16, fontWeight:800, color:x.c, marginTop:2 }}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                <table style={S.tbl}>
                  <thead><tr>
                    <th style={S.th}>Category</th>
                    <th style={{ ...S.th, textAlign:'center' }}>%</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Budget (SAR)</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Actual (SAR)</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Variance</th>
                    <th style={{ ...S.th, textAlign:'center' }}>Health</th>
                  </tr></thead>
                  <tbody>
                    {BUDGET_ROWS.map(r=>{
                      const bv = +detail.contract_value*(+detail[r.pctKey]||0)/100
                      const av = +detail[`actual_${r.key==='team'?'team_expenses':r.key==='supplier'?'supplier_pos':r.key==='subcon'?'subcon_pos':r.key==='food'?'food':r.key==='overtime'?'overtime':r.key==='petty'?'petty_cash':'misc'}`]||0
                      const variance = bv - av
                      const tl = trafficLight(av, bv)
                      return (
                        <tr key={r.key}>
                          <td style={{ ...S.td, fontWeight:600 }}>{r.label}</td>
                          <td style={{ ...S.td, textAlign:'center', color:'#6b7c93' }}>{+detail[r.pctKey]||0}%</td>
                          <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(bv)}</td>
                          <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(av)}</td>
                          <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:variance<0?'#c62828':'#2e7d32', fontWeight:700 }}>
                            {variance<0?'':'+'}{ SAR(variance) }
                          </td>
                          <td style={{ ...S.td, textAlign:'center' }}>
                            <span style={{ background:tl.bg, color:tl.color, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700 }}>{tl.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#f0f4f8', fontWeight:800 }}>
                      <td style={S.td}>TOTAL</td>
                      <td style={{ ...S.td, textAlign:'center' }}>{BUDGET_ROWS.reduce((a,r)=>a+(+detail[r.pctKey]||0),0).toFixed(1)}%</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{SAR(detail.budget_total||0)}</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{SAR(detail.actual_total||0)}</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800, color:((detail.budget_total||0)-(detail.actual_total||0))<0?'#c62828':'#2e7d32' }}>
                        {((detail.budget_total||0)-(detail.actual_total||0))<0?'':'+'}{ SAR((detail.budget_total||0)-(detail.actual_total||0)) }
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── Tab: COMPLETIONS ── */}
            {detailTab==='completions' && (
              <CompletionsTab projectId={detail.project_id} smId={detail.sm_id} />
            )}
          </div>
        </div>
      )}

      {/* ══ BULK EDIT MODAL ══ */}
      {showBulkEdit && (
        <div style={S.overlay} onClick={()=>setShowBulkEdit(false)}>
          <div style={{ ...S.modal, width:700 }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:'#c62828' }}>✏️ Bulk Edit</div>
                <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>
                  Editing <strong>{selectedIds.size} sites</strong> — only filled fields will be updated. Blank = keep existing.
                </div>
              </div>
              <button onClick={()=>setShowBulkEdit(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#6b7c93' }}>✕</button>
            </div>

            {/* Selected sites preview */}
            <div style={{ background:'#fff3e0', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:11, color:'#8C601B', lineHeight:1.8, maxHeight:80, overflowY:'auto' }}>
              {[...selectedIds].map(id => {
                const sm = sites.find(s=>s.id===id)
                return sm ? <span key={id} style={{ marginRight:8, fontWeight:700, fontFamily:'monospace' }}>{sm.sm_id}</span> : null
              })}
            </div>

            {/* Correction fields — only fill what you want to change */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>

              {/* Status */}
              <div>
                <label style={S.label}>Status</label>
                <select style={S.inp} value={beFields.status||''} onChange={e=>setBeFields(p=>({...p,status:e.target.value}))}>
                  <option value="">— no change —</option>
                  {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                </select>
              </div>

              {/* Department */}
              <div>
                <label style={S.label}>Department</label>
                <select style={S.inp} value={beFields.dept_id||''} onChange={e=>setBeFields(p=>({...p,dept_id:e.target.value}))}>
                  <option value="">— no change —</option>
                  {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code} — {d.dept_name}</option>)}
                </select>
              </div>

              {/* Project */}
              <div>
                <label style={S.label}>Project</label>
                <select style={S.inp} value={beFields.project_id||''} onChange={e=>setBeFields(p=>({...p,project_id:e.target.value}))}>
                  <option value="">— no change —</option>
                  {projects.map(p=><option key={p.id} value={p.id}>[{p.project_number}] {p.project_name}</option>)}
                </select>
              </div>

              {/* Contractor */}
              <div>
                <label style={S.label}>Contractor</label>
                <select style={S.inp} value={beFields.contractor_id||''} onChange={e=>setBeFields(p=>({...p,contractor_id:e.target.value}))}>
                  <option value="">— no change —</option>
                  {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_name}</option>)}
                </select>
              </div>

              {/* WF Code — auto-fills budget % when selected */}
              <div>
                <label style={S.label}>WF Code <span style={{ color:'#6b7c93', fontWeight:400, textTransform:'none' }}>(auto-fills budget %)</span></label>
                <select style={S.inp} value={beFields.wf_code||''} onChange={e=>setBeFields(p=>({...p,wf_code:e.target.value}))}>
                  <option value="">— no change —</option>
                  {WF_LIST.map(w=><option key={w.code} value={w.code}>{w.code} — {w.label}</option>)}
                </select>
              </div>

              {/* Work Type */}
              <div>
                <label style={S.label}>Work Type</label>
                <input style={S.inp} placeholder="— no change —" value={beFields.work_type||''} onChange={e=>setBeFields(p=>({...p,work_type:e.target.value}))} />
              </div>

              {/* Start Date */}
              <div>
                <label style={S.label}>Start Date</label>
                <input type="date" style={S.inp} value={beFields.start_date||''} onChange={e=>setBeFields(p=>({...p,start_date:e.target.value}))} />
              </div>

              {/* End Date */}
              <div>
                <label style={S.label}>End Date</label>
                <input type="date" style={S.inp} value={beFields.end_date||''} onChange={e=>setBeFields(p=>({...p,end_date:e.target.value}))} />
              </div>
            </div>

            {/* Budget % override — only shown if NOT using WF Code auto-fill */}
            {!beFields.wf_code && (() => {
              const PCT_FIELDS = [
                { key:'budget_team_pct',     label:'Team %'     },
                { key:'budget_supplier_pct', label:'Supplier %' },
                { key:'budget_subcon_pct',   label:'Subcon %'   },
                { key:'budget_food_pct',     label:'Food %'     },
                { key:'budget_overtime_pct', label:'Overtime %' },
                { key:'budget_petty_pct',    label:'Petty Cash %'},
                { key:'budget_misc_pct',     label:'Misc %'     },
              ]
              const anyPctFilled = PCT_FIELDS.some(f => beFields[f.key] !== undefined && beFields[f.key] !== '')
              const liveTotal = PCT_FIELDS.reduce((a,f) => a + (+beFields[f.key]||0), 0)
              const pctColor  = liveTotal > 100 ? '#c62828' : liveTotal > 70 ? '#e65100' : '#2e7d32'
              return (
                <div style={{ border:'1px solid #e8edf2', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.5 }}>
                      Budget % Override <span style={{ fontWeight:400, textTransform:'none' }}>(leave blank = keep existing)</span>
                    </div>
                    {anyPctFilled && (
                      <div style={{ fontSize:12, fontWeight:800, color: pctColor }}>
                        Total: {liveTotal.toFixed(1)}%
                        {liveTotal > 100 && ' ⛔ EXCEEDS 100%'}
                        {liveTotal > 70 && liveTotal <= 100 && ' ⚠ Margin < 30%'}
                        {liveTotal <= 70 && liveTotal > 0 && ' ✓'}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                    {PCT_FIELDS.map(f => (
                      <div key={f.key}>
                        <label style={{ ...S.label, fontSize:10 }}>{f.label}</label>
                        <input
                          type="number" min="0" max="100" step="0.5"
                          style={{ ...S.inp, borderColor: +beFields[f.key] > 100 ? '#c62828' : '#dde3ec' }}
                          placeholder="—"
                          value={beFields[f.key] ?? ''}
                          onChange={e => {
                            const raw = e.target.value
                            // Hard clamp: never allow > 100
                            const clamped = raw === '' ? '' : Math.min(100, Math.max(0, +raw))
                            setBeFields(p => ({ ...p, [f.key]: clamped === '' ? '' : clamped }))
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  {anyPctFilled && liveTotal > 100 && (
                    <div style={{ marginTop:8, fontSize:11, color:'#c62828', fontWeight:700, background:'#ffebee', borderRadius:6, padding:'6px 10px' }}>
                      ⛔ Total budget exceeds 100% — reduce individual values before saving.
                    </div>
                  )}
                </div>
              )
            })()}

            {/* What will change summary */}
            {Object.keys(beFields).filter(k=>beFields[k]).length > 0 && (
              <div style={{ background:'#e8f5e9', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:11, color:'#2e7d32' }}>
                <strong>Will update:</strong> {Object.keys(beFields).filter(k=>beFields[k]).join(', ')}
                {beFields.wf_code && WF_CODES[beFields.wf_code] && ' (+ all 7 budget % lines)'}
              </div>
            )}

            {beMsg && (
              <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:12, fontSize:12, fontWeight:700,
                background: beMsg.startsWith('✅') ? '#e8f5e9' : '#ffebee',
                color:      beMsg.startsWith('✅') ? '#2e7d32' : '#c62828',
              }}>{beMsg}</div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={()=>{ setBeFields({}); setBeMsg('') }} style={{ ...S.btn('#6b7c93'), padding:'9px 18px' }}>Reset</button>
              <button onClick={saveBulkEdit} disabled={beSaving}
                style={{ ...S.btn(beSaving?'#ccc':'#c62828'), padding:'9px 24px', fontSize:13, cursor:beSaving?'not-allowed':'pointer' }}>
                {beSaving ? '⏳ Saving…' : `Apply to ${selectedIds.size} Sites`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BULK UPLOAD MODAL ══ */}
      {showBulk && (
        <div style={S.overlay} onClick={()=>setShowBulk(false)}>
          <div style={{ ...S.modal, width:1000, maxHeight:'90vh' }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:'#5A32D4' }}>⬆ Bulk Site Upload</div>
                <div style={{ fontSize:12, color:'#6b7c93', marginTop:3 }}>Upload a CSV file to import multiple sites at once</div>
              </div>
              <button onClick={()=>setShowBulk(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#6b7c93' }}>✕</button>
            </div>

            {/* Step 1 — Download Template + Upload File */}
            <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
              <div style={{ flex:1, background:'#f8f9fc', borderRadius:10, padding:'16px 18px', border:'1px solid #e8edf2' }}>
                <div style={{ fontSize:12, fontWeight:800, color:'#5A32D4', marginBottom:6 }}>① Download Template</div>
                <div style={{ fontSize:11, color:'#6b7c93', marginBottom:12, lineHeight:1.5 }}>
                  Get a CSV template with the correct column headers and a sample row. Fill it in with your sites data.
                </div>
                <button onClick={downloadBulkTemplate} style={{ ...S.btn('#5A32D4'), padding:'8px 18px', fontSize:12 }}>
                  ⬇ Download CSV Template
                </button>
              </div>
              <div style={{ flex:1, background:'#f8f9fc', borderRadius:10, padding:'16px 18px', border:'1px solid #e8edf2' }}>
                <div style={{ fontSize:12, fontWeight:800, color:'#8C601B', marginBottom:6 }}>② Upload Your File</div>
                <div style={{ fontSize:11, color:'#6b7c93', marginBottom:12, lineHeight:1.5 }}>
                  Upload your completed CSV. The system will validate each row and show you errors before importing.
                </div>
                <label style={{ ...S.btn(), padding:'8px 18px', fontSize:12, cursor:'pointer', display:'inline-block' }}>
                  📂 Choose CSV File
                  <input type="file" accept=".csv" style={{ display:'none' }} onChange={handleBulkFile} />
                </label>
              </div>
            </div>

            {/* Column reference */}
            <div style={{ background:'#fff3e0', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:11, color:'#e65100', lineHeight:1.7 }}>
              <strong>Required columns:</strong> dept_code · project_number &nbsp;|&nbsp;
              <strong>Optional:</strong> wf_code · site_no · site_name · location · contractor_code · contract_value · start_date · end_date · status · work_type · budget_*_pct (team/supplier/subcon/food/overtime/petty/misc)
            </div>

            {/* Status message */}
            {bulkMsg && (
              <div style={{ padding:'8px 14px', borderRadius:8, marginBottom:12, fontSize:12, fontWeight:700,
                background: bulkMsg.startsWith('✅') ? '#e8f5e9' : bulkMsg.startsWith('❌') ? '#ffebee' : '#e3f2fd',
                color:      bulkMsg.startsWith('✅') ? '#2e7d32' : bulkMsg.startsWith('❌') ? '#c62828' : '#1565c0',
              }}>
                {bulkMsg}
              </div>
            )}

            {/* Preview table */}
            {bulkRows.length > 0 && (
              <>
                <div style={{ fontSize:12, fontWeight:700, color:'#1a2e3d', marginBottom:8 }}>
                  Preview — {bulkRows.length} rows &nbsp;·&nbsp;
                  <span style={{ color:'#2e7d32' }}>{bulkRows.filter(r=>r._ok).length} valid</span>
                  {bulkRows.filter(r=>!r._ok).length > 0 && <span style={{ color:'#c62828' }}> · {bulkRows.filter(r=>!r._ok).length} errors</span>}
                </div>
                <div style={{ overflowX:'auto', marginBottom:16 }}>
                  <table style={{ ...S.tbl, minWidth:800 }}>
                    <thead><tr>
                      {['#','Dept','Project','WF Code','Site Name','Location','Contract SAR','Start','End','Status','Budget %',''].map(h=>(
                        <th key={h} style={{ ...S.th, fontSize:10, padding:'6px 8px' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {bulkRows.map(r => {
                        const totalPct = ['budget_team_pct','budget_supplier_pct','budget_subcon_pct','budget_food_pct','budget_overtime_pct','budget_petty_pct','budget_misc_pct'].reduce((a,k)=>a+(+r[k]||0),0)
                        return (
                          <tr key={r._idx} style={{ background: r._ok ? (r._idx%2===0?'#fff':'#fafbfc') : '#fff8f8' }}>
                            <td style={{ ...S.td, fontSize:11, color:'#aab2bd', padding:'6px 8px' }}>{r._idx}</td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px' }}>
                              {r._dept ? <span style={S.badge()}>{r.dept_code}</span> : <span style={{ color:'#c62828', fontWeight:700 }}>{r.dept_code||'—'}</span>}
                            </td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px' }}>
                              {r._project ? <span style={{ color:'#5A32D4', fontWeight:700, fontFamily:'monospace' }}>{r.project_number}</span> : <span style={{ color:'#c62828', fontWeight:700 }}>{r.project_number||'—'}</span>}
                            </td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px', fontFamily:'monospace' }}>{r.wf_code||'—'}</td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.site_name||'—'}</td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px', color:'#6b7c93' }}>{r.location||'—'}</td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px', textAlign:'right', fontFamily:'monospace' }}>
                              {r.contract_value ? SAR(+r.contract_value) : '—'}
                            </td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px' }}>{r.start_date||'—'}</td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px' }}>{r.end_date||'—'}</td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px' }}>
                              <span style={S.badge(r.status==='ACTIVE'?'#2e7d32':'#6b7c93')}>{r.status||'PENDING'}</span>
                            </td>
                            <td style={{ ...S.td, fontSize:11, padding:'6px 8px', textAlign:'center', fontWeight:700,
                              color: totalPct > 70 ? '#c62828' : totalPct > 0 ? '#2e7d32' : '#aab2bd'
                            }}>{totalPct > 0 ? `${totalPct}%` : '—'}</td>
                            <td style={{ ...S.td, padding:'6px 8px' }}>
                              {r._ok && !r._warns?.length
                                ? <span style={{ color:'#2e7d32', fontSize:16 }}>✓</span>
                                : r._ok && r._warns?.length
                                  ? <span title={r._warns.join('\n')} style={{ color:'#e65100', fontSize:12, cursor:'help' }}>⚠ {r._warns[0]}</span>
                                  : <span title={r._errs.join('\n')} style={{ color:'#c62828', fontSize:12, cursor:'help' }}>✕ {r._errs[0]}</span>
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                  <button onClick={()=>{ setBulkRows([]); setBulkMsg('') }} style={{ ...S.btn('#6b7c93'), padding:'9px 20px' }}>
                    Clear
                  </button>
                  <button onClick={saveBulk} disabled={bulkImp || bulkRows.filter(r=>r._ok).length===0}
                    style={{ ...S.btn(bulkImp?'#ccc':'#2e7d32'), padding:'9px 24px', fontSize:13,
                      cursor: bulkImp ? 'not-allowed' : 'pointer',
                      boxShadow: bulkImp ? 'none' : '0 3px 8px rgba(46,125,50,0.35)',
                    }}>
                    {bulkImp ? '⏳ Importing…' : `✅ Import ${bulkRows.filter(r=>r._ok).length} Valid Sites`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Completions Sub-Component ─────────────────────────────────────
function CompletionsTab({ projectId, smId }) {
  const [completions, setCompletions] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [noTable,     setNoTable]     = useState(false)

  useEffect(() => {
    if (!projectId) { setLoading(false); return }
    supabase.from('site_completions').select('*').eq('project_id',projectId)
      .order('completion_date',{ascending:false}).limit(100)
      .then(({ data, error }) => {
        if (error?.code==='42P01') setNoTable(true)
        else setCompletions(data||[])
        setLoading(false)
      })
  }, [projectId])

  const CHIP = { PENDING:'#9e9e9e', SIGNED_OFF:'#1565c0', READY_TO_INVOICE:'#2e7d32', INVOICED:'#1a237e', REJECTED:'#c62828' }

  if (loading) return <div style={{ textAlign:'center', padding:30, color:'#6b7c93' }}>Loading…</div>
  if (noTable) return <div style={{ textAlign:'center', padding:40, color:'#e65100', fontSize:13 }}>⚠ Run <strong>PERFECT_FINAL_PATCH.sql</strong> in Supabase first.</div>
  if (completions.length===0) return (
    <div style={{ textAlign:'center', padding:40, color:'#aab2bd', fontSize:13 }}>
      No completion records for {smId} yet.<br/>
      <span style={{ fontSize:11 }}>Add from the Invoicing module once field sign-off is done.</span>
    </div>
  )
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
      <thead><tr>
        {['Date','Description','Qty','Field ✓','PM/DH ✓','Status','Invoice'].map(h=>(
          <th key={h} style={{ background:'#f0f4f8', color:'#6b7c93', padding:'8px 10px', fontWeight:700, textAlign:'left', fontSize:11, borderBottom:'2px solid #e0e7ef' }}>{h}</th>
        ))}
      </tr></thead>
      <tbody>
        {completions.map((c,i)=>(
          <tr key={c.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8' }}>{c.completion_date?new Date(c.completion_date).toLocaleDateString('en-GB'):'—'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', maxWidth:200 }}><div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.description}</div></td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8' }}>{c.quantity_completed?`${c.quantity_completed} ${c.uom||''}`:'—'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', textAlign:'center' }}>{c.field_signed_off?'✅':'⬜'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', textAlign:'center' }}>{(c.pm_confirmed||c.dept_head_confirmed)?'✅':'⬜'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8' }}>
              <span style={{ background:(CHIP[c.status]||'#9e9e9e')+'18', color:CHIP[c.status]||'#9e9e9e', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700 }}>
                {(c.status||'').replace(/_/g,' ')}
              </span>
            </td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', fontSize:11, color:'#6b7c93' }}>{c.invoice_id?'✅ Invoiced':'—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
