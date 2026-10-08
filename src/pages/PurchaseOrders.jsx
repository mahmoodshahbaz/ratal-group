import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Operations
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { DetailField } from '../components/ExpandableRow'
import { printDocument, openPrintWindow } from '../lib/templatePrint'
import { extractPdfText } from '../lib/pdfExtract'
import { parsePO } from '../lib/poParser'
import { useDriveUpload } from '../hooks/useDriveUpload'

const PP = "'Poppins',sans-serif"
const TODAY = new Date().toISOString().split('T')[0]
const YEAR  = new Date().getFullYear()

const INC_PRI='#0079BC', INC_BOX1='#3A8B7A', INC_BOX2='#E1F5EE'
const OUT_PRI='#0079BC', OUT_BOX1='#3A8B7A', OUT_BOX2='#E1F5EE'

const CATEGORIES = [
  { value:'SUB_CONTRACTOR',   label:'Sub-Contractor' },
  { value:'SUPPLIER',         label:'Supplier' },
  { value:'VENDOR',           label:'Vendor' },
  { value:'EQUIPMENT_RENTAL', label:'Equipment Rental' },
  { value:'LOCAL_SUPPLIER',   label:'Local Supplier' },
]
const CATEGORY_DRIVE_FOLDER = {
  'SUB_CONTRACTOR':'po-sub-contractors','SUPPLIER':'po-suppliers',
  'VENDOR':'po-vendors','LOCAL_SUPPLIER':'po-local-suppliers','EQUIPMENT_RENTAL':'po-equipment-rentals',
}
const PAYMENT_TERMS = [
  { value:'CREDIT',label:'Credit' },{ value:'ADVANCE',label:'Advance Payment' },
  { value:'PARTIAL',label:'Partial Payment' },{ value:'MOBILIZATION',label:'Mobilization' },
]
const IPO_STATUS = {
  ACTIVE:   { bg:'#e8f5e9',color:'#2e7d32',label:'Active' },
  INVOICED: { bg:'#e3f2fd',color:'#0277bd',label:'Invoiced' },
  CLOSED:   { bg:'#e3f0f8',color:'#0079BC',label:'Closed' },
  CANCELLED:{ bg:'#ffebee',color:'#c62828',label:'Cancelled' },
}
const BILLING_MODES = [
  { value:'QTY',        label:'Qty-Based',    desc:'Invoice per line item x qty installed' },
  { value:'PERCENTAGE', label:'% of Lumpsum', desc:'Invoice as % of total PO value' },
  { value:'MILESTONE',  label:'Milestone',    desc:'All-or-nothing per milestone line' },
]
const CURRENCIES = ['SAR','USD','EUR','GBP','AED','KWD','OMR','BHD','QAR']
const OPO_STATUS = {
  PENDING_DH: { bg:'#fff8e1',color:'#f57f17',label:'Pending DH' },
  DH_APPROVED:{ bg:'#e3f2fd',color:'#0277bd',label:'DH Approved' },
  ISSUED:     { bg:'#e8f5e9',color:'#2e7d32',label:'Issued' },
  REJECTED:   { bg:'#ffebee',color:'#c62828',label:'Rejected' },
}
const emptyItem = () => ({ id:crypto.randomUUID(), job_type:'', description:'', qty:'1', unit_price:'', newJobType:'' })
const EMPTY_IPO = {
  po_date:TODAY, department_id:'', dept_head_id:'', project_id:'', site_id:'',
  contractor_id:'', contractor_po_number:'', job_type:'', description:'',
  payment_terms:'CREDIT', payment_terms_days:'30', notes:'',
  attachment_url:'', attachment_name:'',
  billing_mode:'QTY', retention_pct:'0', retention_basis:'EX_VAT',
  original_currency:'SAR', fx_rate:'1',
}
const EMPTY_OPO = {
  po_date:TODAY, department_id:'', dept_head_id:'', requested_by:'',
  project_id:'', site_id:'', supplier_id:'', category:'', job_type:'',
  payment_terms:'CREDIT', notes:'', brief_description:'',
}
const EMPTY_CO = {
  co_date:TODAY, job_type:'', description:'', qty:'1', unit_price:'',
  co_value:'0', notes:'', attachment_url:'', attachment_name:'',
}

const S = {
  inp:{ width:'100%', padding:'9px 11px', borderRadius:8, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:PP, boxSizing:'border-box' },
  label:{ display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.3px', fontFamily:PP },
  overlay:{ position:'fixed', inset:0, background:'rgba(10,20,40,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' },
  row:{ display:'flex', gap:12, marginBottom:12 },
  col:{ flex:1, minWidth:0 },
  btn:(bg)=>({ padding:'9px 20px', borderRadius:9, border:'none', background:bg, color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap', fontFamily:PP }),
  section:{ background:'#f8faff', border:'1.5px solid #e8edf5', borderRadius:10, padding:'14px 16px', marginBottom:14 },
}

function fmt(n){ return new Intl.NumberFormat('en-SA',{minimumFractionDigits:0,maximumFractionDigits:0}).format(n||0) }
function StatusPill({ map, val }){
  const s=map[val]||{ bg:'#f0f4f8',color:'#6b7c93',label:val||'—' }
  return <span style={{ background:s.bg,color:s.color,padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:800,fontFamily:PP }}>{s.label}</span>
}

function LineItemsEditor({ items, onChange, accentColor, jobTypes=[], onAddJobType }) {
  function update(idx,field,val){ onChange(items.map((r,i)=>i===idx?{...r,[field]:val}:r)) }
  function addRow(){ onChange([...items, emptyItem()]) }
  function removeRow(idx){ if(items.length>1) onChange(items.filter((_,i)=>i!==idx)) }
  const total=items.reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.unit_price)||0),0)
  return (
    <div style={{ fontFamily:PP }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:800, color:accentColor, textTransform:'uppercase', letterSpacing:0.8 }}>Line Items</div>
        <button type="button" onClick={addRow}
          style={{ padding:'5px 14px', borderRadius:8, border:`1.5px solid ${accentColor}`, background:'#fff', color:accentColor, fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:PP }}>
          + Add Line
        </button>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ background:'#f8faff' }}>
            {['Job Type','Description *','Qty','Unit Price (SAR)','Total',''].map(h=>(
              <th key={h} style={{ padding:'7px 8px', textAlign:'left', fontSize:10, fontWeight:800, color:'#6b7c93', textTransform:'uppercase', borderBottom:`2px solid ${accentColor}20`, whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((r,i)=>{
            const lineTotal=(parseFloat(r.qty)||0)*(parseFloat(r.unit_price)||0)
            const showAddNew=r.job_type==='__NEW__'
            return (
              <tr key={r.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                <td style={{ padding:'6px 6px 6px 0', width:180 }}>
                  {showAddNew ? (
                    <div style={{ display:'flex', gap:4 }}>
                      <input autoFocus style={{ ...S.inp, fontSize:11, padding:'5px 7px', flex:1, borderColor:'#6366f1' }}
                        placeholder="New job type…" value={r.newJobType||''}
                        onChange={e=>update(i,'newJobType',e.target.value)}
                        onKeyDown={e=>{
                          if(e.key==='Enter'&&r.newJobType?.trim()){ onAddJobType&&onAddJobType(r.newJobType.trim()); update(i,'job_type',r.newJobType.trim()) }
                          else if(e.key==='Escape') update(i,'job_type','')
                        }} />
                      <button type="button"
                        style={{ padding:'4px 8px', borderRadius:6, border:'1.5px solid #6366f1', background:'#6366f1', color:'#fff', fontWeight:700, fontSize:10, cursor:'pointer' }}
                        onClick={()=>{ if(r.newJobType?.trim()){ onAddJobType&&onAddJobType(r.newJobType.trim()); update(i,'job_type',r.newJobType.trim()) } }}>
                        V
                      </button>
                      <button type="button"
                        style={{ padding:'4px 7px', borderRadius:6, border:'1px solid #dde3ec', background:'#fff', color:'#6b7c93', fontSize:12, cursor:'pointer' }}
                        onClick={()=>update(i,'job_type','')}>x</button>
                    </div>
                  ) : (
                    <select style={{ ...S.inp, fontSize:11, padding:'6px 8px' }}
                      value={r.job_type} onChange={e=>update(i,'job_type',e.target.value)}>
                      <option value="">— Select —</option>
                      {jobTypes.map(j=><option key={j} value={j}>{j}</option>)}
                      <option value="__NEW__">+ Add new job type…</option>
                    </select>
                  )}
                </td>
                <td style={{ padding:'6px 6px' }}>
                  <input style={{ ...S.inp, fontSize:12, padding:'6px 8px' }}
                    value={r.description} onChange={e=>update(i,'description',e.target.value)} placeholder="Description…" />
                </td>
                <td style={{ padding:'6px 6px', width:70 }}>
                  <input type="number" min="0.01" step="0.01" style={{ ...S.inp, fontSize:12, padding:'6px 8px', textAlign:'right' }}
                    value={r.qty} onChange={e=>update(i,'qty',e.target.value)} />
                </td>
                <td style={{ padding:'6px 6px', width:130 }}>
                  <input type="number" min="0" step="0.01" style={{ ...S.inp, fontSize:12, padding:'6px 8px', textAlign:'right' }}
                    value={r.unit_price} onChange={e=>update(i,'unit_price',e.target.value)} placeholder="0.00" />
                </td>
                <td style={{ padding:'6px 6px', width:110, textAlign:'right', fontWeight:700, fontSize:12, color:'#1a2e3d' }}>
                  SAR {fmt(lineTotal)}
                </td>
                <td style={{ padding:'6px 0 6px 6px', width:28, textAlign:'center' }}>
                  {items.length>1 && (
                    <button type="button" onClick={()=>removeRow(i)}
                      style={{ background:'none', border:'none', color:'#e57373', cursor:'pointer', fontSize:15, padding:'0 2px' }}>x</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:10, borderTop:`2px solid ${accentColor}30`, marginTop:6 }}>
        <div style={{ background:`${accentColor}12`, borderRadius:8, padding:'8px 18px', textAlign:'right' }}>
          <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, textTransform:'uppercase' }}>Overall Total</div>
          <div style={{ fontSize:18, fontWeight:900, color:accentColor }}>SAR {fmt(total)}</div>
        </div>
      </div>
    </div>
  )
}

export default function PurchaseOrders({ entityId, entityCode, isAr }) {
  const [incomingPOs,setIncomingPOs]=useState([])
  const [outgoingPOs,setOutgoingPOs]=useState([])
  const [departments,setDepartments]=useState([])
  const [contractors,setContractors]=useState([])
  const [suppliers,setSuppliers]=useState([])
  const [allEmployees,setAllEmployees]=useState([])
  const [loading,setLoading]=useState(true)
  const [poTab,setPoTab]=useState('incoming')
  const [ipoFilter,setIpoFilter]=useState('ALL')
  const [opoFilter,setOpoFilter]=useState('ALL')
  const [expandedIPO,setExpandedIPO]=useState(new Set())
  const [expandedOPO,setExpandedOPO]=useState(new Set())
  const [showIpoBanner,setShowIpoBanner]=useState(false)
  const [showIpoForm,setShowIpoForm]=useState(false)
  const [ipoStep,setIpoStep]=useState(0)
  const [editIpo,setEditIpo]=useState(null)
  const [ipoForm,setIpoForm]=useState(EMPTY_IPO)
  const [ipoItems,setIpoItems]=useState([emptyItem()])
  const [ipoProjects,setIpoProjects]=useState([])
  const [ipoSites,setIpoSites]=useState([])
  const [savingIpo,setSavingIpo]=useState(false)
  const ipoFileRef=useRef(null)
  const [showCoForm,setShowCoForm]=useState(false)
  const [coParent,setCoParent]=useState(null)
  const [coForm,setCoForm]=useState(EMPTY_CO)
  const [savingCo,setSavingCo]=useState(false)
  const [showOpoBanner,setShowOpoBanner]=useState(false)
  const [showOpoForm,setShowOpoForm]=useState(false)
  const [opoStep,setOpoStep]=useState(0)
  const [editOpo,setEditOpo]=useState(null)
  const [opoForm,setOpoForm]=useState(EMPTY_OPO)
  const [opoItems,setOpoItems]=useState([emptyItem()])
  const [opoProjects,setOpoProjects]=useState([])
  const [opoSites,setOpoSites]=useState([])
  const [opoDeptEmps,setOpoDeptEmps]=useState([])
  const [savingOpo,setSavingOpo]=useState(false)
  const [allJobTypes,setAllJobTypes]=useState([])
  const [opoJobTypes,setOpoJobTypes]=useState([])
  const [filteredSuppliers,setFilteredSuppliers]=useState([])
  const [ipoSearch,setIpoSearch]=useState('')
  const [ipoDeptFilter,setIpoDeptFilter]=useState('')
  const [ipoDateFrom,setIpoDateFrom]=useState('')
  const [ipoDateTo,setIpoDateTo]=useState('')
  const [opoSearch,setOpoSearch]=useState('')
  const [opoDeptFilter,setOpoDeptFilter]=useState('')
  const [opoDateFrom,setOpoDateFrom]=useState('')
  const [opoDateTo,setOpoDateTo]=useState('')
  const [showPdfImport,setShowPdfImport]=useState(false)
  const [pdfStage,setPdfStage]=useState('upload')
  const [pdfFile,setPdfFile]=useState(null)
  const [pdfDragOver,setPdfDragOver]=useState(false)
  const [pdfParsed,setPdfParsed]=useState(null)
  const [pdfError,setPdfError]=useState('')
  const [pdfContractorId,setPdfContractorId]=useState('')
  const [pdfContractorPoNum,setPdfContractorPoNum]=useState('')
  const [pdfPoDate,setPdfPoDate]=useState(TODAY)
  const [pdfTotalValue,setPdfTotalValue]=useState('')
  const [pdfCurrency,setPdfCurrency]=useState('SAR')
  const [pdfFxRate,setPdfFxRate]=useState('1')
  const [pdfDeptId,setPdfDeptId]=useState('')
  const [pdfProjectId,setPdfProjectId]=useState('')
  const [pdfPaymentDays,setPdfPaymentDays]=useState('30')
  const [pdfNotes,setPdfNotes]=useState('')
  const [pdfLineItems,setPdfLineItems]=useState([emptyItem()])
  const [pdfSaveError,setPdfSaveError]=useState('')
  const [pdfProjects,setPdfProjects]=useState([])
  const driveUpload = useDriveUpload ? useDriveUpload() : null

  useEffect(()=>{ if(entityId) load() },[entityId])

  async function load(){
    setLoading(true)
    const [
      {data:ipData},{data:opData},{data:depts},{data:cons},{data:sups},{data:emps},{data:jt}
    ] = await Promise.all([
      supabase.from('incoming_pos')
        .select('*, departments(dept_name,dept_code), employees!dept_head_id(full_name_en), contractors(contractor_name,contractor_code,vendor_type), projects(project_number,project_name), site_masters(sm_id,site_name), incoming_po_items(*), incoming_po_change_orders(*)')
        .eq('entity_id',entityId).order('po_date',{ascending:false}),
      supabase.from('outgoing_pos')
        .select('*, departments(dept_name,dept_code), employees!dept_head_id(full_name_en), contractors!supplier_id(contractor_name,contractor_code,vendor_type), projects(project_number,project_name), site_masters(sm_id,site_name), outgoing_po_items(*)')
        .eq('entity_id',entityId).order('po_date',{ascending:false}),
      supabase.from('departments').select('id,dept_name,dept_code,dept_head_id,pm_id').eq('entity_id',entityId).eq('is_active',true).order('dept_name'),
      supabase.from('contractors').select('id,contractor_name,contractor_code,vendor_type,contact_email').eq('entity_id',entityId).eq('status','ACTIVE').in('vendor_type',['CONTRACTOR']).order('contractor_name'),
      supabase.from('contractors').select('id,contractor_name,contractor_code,vendor_type,specialization,contact_email,address').eq('entity_id',entityId).eq('status','ACTIVE').in('vendor_type',['SUB_CONTRACTOR','SUPPLIER','VENDOR','LOCAL_SUPPLIER','EQUIPMENT_RENTAL']).order('contractor_name'),
      supabase.from('employees').select('id,full_name_en,department_id,designation').eq('entity_id',entityId).order('full_name_en'),
      supabase.from('po_job_types').select('contractor_type,job_type_name,sort_order').or(`entity_id.is.null,entity_id.eq.${entityId}`).eq('is_active',true).order('sort_order'),
    ])
    setIncomingPOs(ipData||[])
    setOutgoingPOs(opData||[])
    setDepartments(depts||[])
    setContractors(cons||[])
    setSuppliers(sups||[])
    setAllEmployees(emps||[])
    setAllJobTypes(jt||[])
    setLoading(false)
  }

  async function onIpoDeptChange(deptId){
    setIpoForm(f=>({...f,department_id:deptId,dept_head_id:'',project_id:'',site_id:''}))
    setIpoProjects([]); setIpoSites([])
    if(!deptId) return
    const dept=departments.find(d=>d.id===deptId)
    if(dept?.dept_head_id) setIpoForm(f=>({...f,dept_head_id:dept.dept_head_id}))
    const {data:projs}=await supabase.from('projects').select('id,project_number,project_name').eq('entity_id',entityId).eq('department_id',deptId).order('project_number')
    if(projs&&projs.length>0){ setIpoProjects(projs) }
    else {
      const {data:all}=await supabase.from('projects').select('id,project_number,project_name').eq('entity_id',entityId).order('project_number')
      setIpoProjects(all||[])
    }
  }
  async function onIpoProjectChange(projId){
    setIpoForm(f=>({...f,project_id:projId,site_id:''})); setIpoSites([])
    if(!projId) return
    const {data:sites}=await supabase.from('site_masters').select('id,sm_id,site_name,job_no,location').eq('project_id',projId).order('sm_id')
    setIpoSites(sites||[])
  }
  async function onOpoDeptChange(deptId){
    setOpoForm(f=>({...f,department_id:deptId,dept_head_id:'',requested_by:'',project_id:'',site_id:''}))
    setOpoProjects([]); setOpoSites([]); setOpoDeptEmps([])
    if(!deptId) return
    const dept=departments.find(d=>d.id===deptId)
    if(dept?.dept_head_id) setOpoForm(f=>({...f,dept_head_id:dept.dept_head_id}))
    const [{data:projs},{data:emps}]=await Promise.all([
      supabase.from('projects').select('id,project_number,project_name').eq('entity_id',entityId).eq('department_id',deptId).order('project_number'),
      supabase.from('employees').select('id,full_name_en,department_id,designation').eq('entity_id',entityId).eq('department_id',deptId).order('full_name_en'),
    ])
    if(projs&&projs.length>0){ setOpoProjects(projs) }
    else {
      const {data:all}=await supabase.from('projects').select('id,project_number,project_name').eq('entity_id',entityId).order('project_number')
      setOpoProjects(all||[])
    }
    const deptRec=departments.find(d=>d.id===deptId)||{}
    const dhPmIds=[deptRec.dept_head_id,deptRec.pm_id].filter(Boolean)
    const filtered=(emps||[]).filter(e=>dhPmIds.includes(e.id)||/supervisor|manager|head|director|lead/i.test(e.designation||''))
    setOpoDeptEmps(filtered.length?filtered:(emps||[]))
  }
  async function onOpoProjectChange(projId){
    setOpoForm(f=>({...f,project_id:projId,site_id:''})); setOpoSites([])
    if(!projId) return
    const {data:sites}=await supabase.from('site_masters').select('id,sm_id,site_name,job_no,location').eq('project_id',projId).order('sm_id')
    setOpoSites(sites||[])
  }
  function onOpoCategoryChange(cat){
    setOpoForm(f=>({...f,category:cat,supplier_id:''}))
    setFilteredSuppliers(cat?suppliers.filter(s=>s.vendor_type===cat):suppliers)
    buildOpoJobTypes(cat,null)
  }
  function onOpoSupplierChange(suppId){
    setOpoForm(f=>({...f,supplier_id:suppId}))
    const sup=suppliers.find(s=>s.id===suppId)
    buildOpoJobTypes(opoForm.category,sup?.specialization||null)
  }
  function buildOpoJobTypes(category,specialization){
    const base=allJobTypes.filter(j=>j.contractor_type===category).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99)).map(j=>j.job_type_name)
    if(specialization){
      const idx=base.findIndex(j=>j.toLowerCase()===specialization.toLowerCase())
      if(idx>0){ const moved=base.splice(idx,1); base.unshift(moved[0]) }
    }
    setOpoJobTypes(base)
  }
  async function addJobType(name){
    if(!opoForm.category||!name) return
    setOpoJobTypes(prev=>prev.includes(name)?prev:[name,...prev])
    setAllJobTypes(prev=>[...prev,{contractor_type:opoForm.category,job_type_name:name,sort_order:99}])
    await supabase.from('po_job_types').upsert({ entity_id:entityId, contractor_type:opoForm.category, job_type_name:name, sort_order:99, is_active:true },{ onConflict:'entity_id,contractor_type,job_type_name' })
  }
  async function generatePoNumber(supplierId){
    const sup=suppliers.find(s=>s.id===supplierId)
    const code=(sup?.contractor_code||'SUP').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,6)
    const {data}=await supabase.rpc('next_po_sequence',{p_entity_id:entityId,p_year:YEAR})
    const seq=String(data||1).padStart(3,'0')
    return {poNumber:`RAT-PO-${YEAR}-${code}-${seq}`,seq:data||1,year:YEAR}
  }
  async function saveIpo(){
    if(!ipoForm.contractor_id||!ipoForm.contractor_po_number||!ipoForm.department_id){ alert('Department, Contractor and Contractor PO Number are required.'); return }
    if(ipoItems.some(r=>!r.description)){ alert('All line items must have a description.'); return }
    setSavingIpo(true)
    const subtotal=ipoItems.reduce((s,r)=>(s+(parseFloat(r.qty)||0)*(parseFloat(r.unit_price)||0)),0)
    const payload={ entity_id:entityId,...ipoForm, subtotal, total_value:subtotal, retention_pct:parseFloat(ipoForm.retention_pct)||0, fx_rate:parseFloat(ipoForm.fx_rate)||1, payment_terms_days:parseInt(ipoForm.payment_terms_days)||30 }
    let ipoId=editIpo?.id
    if(editIpo){
      await supabase.from('incoming_pos').update({...payload,updated_at:new Date().toISOString()}).eq('id',ipoId)
      await supabase.from('incoming_po_items').delete().eq('incoming_po_id',ipoId)
    } else {
      const {data}=await supabase.from('incoming_pos').insert(payload).select('id').single()
      ipoId=data?.id
    }
    if(ipoId){
      const itemRows=ipoItems.map((r,i)=>({ incoming_po_id:ipoId, sort_order:i, job_type:r.job_type, description:r.description, qty:parseFloat(r.qty)||1, unit_price:parseFloat(r.unit_price)||0 }))
      await supabase.from('incoming_po_items').insert(itemRows)
    }
    setSavingIpo(false); setShowIpoForm(false); load()
  }
  async function saveCo(){
    if(!coForm.description||!coForm.co_value){ alert('Description and CO Value are required.'); return }
    setSavingCo(true)
    const parent=incomingPOs.find(p=>p.id===coParent)
    const existingCos=parent?.incoming_po_change_orders||[]
    const coNum=String(existingCos.length+1).padStart(3,'0')
    const payload={ entity_id:entityId, incoming_po_id:coParent, co_number:`CO-${coNum}`, contractor_po_number:parent?.contractor_po_number, original_po_value:parent?.total_value, cumulative_value:(parent?.total_value||0)+parseFloat(coForm.co_value||0), ...coForm, co_value:parseFloat(coForm.co_value||0), qty:parseFloat(coForm.qty||1), unit_price:parseFloat(coForm.unit_price||0) }
    await supabase.from('incoming_po_change_orders').insert(payload)
    if(!parent?.has_change_orders) await supabase.from('incoming_pos').update({has_change_orders:true,original_value:parent?.total_value}).eq('id',coParent)
    setSavingCo(false); setShowCoForm(false); load()
  }
  async function saveOpo(){
    if(!opoForm.supplier_id||!opoForm.department_id){ alert('Department and Supplier are required.'); return }
    if(opoItems.some(r=>!r.description)){ alert('All line items must have a description.'); return }
    const preWin=openPrintWindow()
    setSavingOpo(true)
    const subtotal=opoItems.reduce((s,r)=>(s+(parseFloat(r.qty)||0)*(parseFloat(r.unit_price)||0)),0)
    const sup=suppliers.find(s=>s.id===opoForm.supplier_id)
    const selDept=departments.find(d=>d.id===opoForm.department_id)||{}
    let poNumber=editOpo?.po_number, poSeq=editOpo?.po_seq, poYear=editOpo?.po_year
    if(!editOpo){ const gen=await generatePoNumber(opoForm.supplier_id); poNumber=gen.poNumber; poSeq=gen.seq; poYear=gen.year }
    const payload={ entity_id:entityId,...opoForm, po_number:poNumber, po_seq:poSeq, po_year:poYear, supplier_code:sup?.contractor_code, subtotal, total_value:subtotal, approval_status:editOpo?.approval_status||'PENDING_DH', source:'DESKTOP' }
    let opoId=editOpo?.id
    if(editOpo){
      await supabase.from('outgoing_pos').update({...payload,updated_at:new Date().toISOString()}).eq('id',opoId)
      await supabase.from('outgoing_po_items').delete().eq('outgoing_po_id',opoId)
    } else {
      const {data}=await supabase.from('outgoing_pos').insert(payload).select('id').single()
      opoId=data?.id
    }
    if(opoId){
      const itemRows=opoItems.map((r,i)=>({ outgoing_po_id:opoId, sort_order:i, job_type:r.job_type==='__NEW__'?(r.newJobType||''):(r.job_type||''), description:r.description, qty:parseFloat(r.qty)||1, unit_price:parseFloat(r.unit_price)||0 }))
      await supabase.from('outgoing_po_items').insert(itemRows)
    }
    setSavingOpo(false)
    const driveFolder=CATEGORY_DRIVE_FOLDER[opoForm.category]||'po-sub-contractors'
    const catLabel=CATEGORIES.find(c=>c.value===opoForm.category)?.label||''
    const selProject=opoProjects.find(p=>p.id===opoForm.project_id)
    const selSite=opoSites.find(s=>s.id===opoForm.site_id)
    const deptHeadEmp=allEmployees.find(e=>e.id===selDept.dept_head_id)
    const requesterEmp=allEmployees.find(e=>e.id===opoForm.requested_by)
    printDocument('outgoing_po',{
      po_number:poNumber||'', po_date:opoForm.po_date, vendor_name_en:sup?.contractor_name||'', vendor_code:sup?.contractor_code||'', vendor_address:sup?.address||'', vendor_type:catLabel,
      ship_to_dept:selDept.dept_code||selDept.dept_name||'', requested_by_name:requesterEmp?.full_name_en||'', dept_head_name:deptHeadEmp?.full_name_en||'',
      project_number:selProject?`${selProject.project_number} — ${selProject.project_name}`:'', site_number:selSite?`${selSite.sm_id}${selSite.site_name?' — '+selSite.site_name:''}`:'' ,
      payment_terms:opoForm.payment_terms, notes:opoForm.notes||'', category:catLabel,
      lines:opoItems.map(r=>({ job_type:r.job_type==='__NEW__'?(r.newJobType||''):(r.job_type||''), description:r.description, qty:parseFloat(r.qty)||1, unit_price:parseFloat(r.unit_price)||0, total:(parseFloat(r.qty)||1)*(parseFloat(r.unit_price)||0) })),
      subtotal,
    },{ orientation:'portrait', driveFolder, driveFileName:`${poNumber||'PO'}.pdf`, requestDate:opoForm.po_date, autoRun:true, _preWin:preWin })
    setShowOpoForm(false); load()
  }
  async function updateOpoStatus(id,status,reason){
    const upd={approval_status:status,updated_at:new Date().toISOString()}
    if(status==='DH_APPROVED'||status==='ISSUED') upd.approved_at=new Date().toISOString()
    if(status==='ISSUED') upd.issued_at=new Date().toISOString()
    if(reason) upd.rejection_reason=reason
    await supabase.from('outgoing_pos').update(upd).eq('id',id); load()
  }
  function openNewIpo(){ setEditIpo(null); setIpoForm(EMPTY_IPO); setIpoItems([emptyItem()]); setIpoProjects([]); setIpoSites([]); setIpoStep(1); setShowIpoBanner(true) }
  function openEditIpo(po){
    setEditIpo(po)
    setIpoForm({ po_date:po.po_date||TODAY, department_id:po.department_id||'', dept_head_id:po.dept_head_id||'', project_id:po.project_id||'', site_id:po.site_id||'', contractor_id:po.contractor_id||'', contractor_po_number:po.contractor_po_number||'', job_type:po.job_type||'', description:po.description||'', payment_terms:po.payment_terms||'CREDIT', payment_terms_days:String(po.payment_terms_days||30), notes:po.notes||'', attachment_url:po.attachment_url||'', attachment_name:po.attachment_name||'', billing_mode:po.billing_mode||'QTY', retention_pct:String(po.retention_pct||0), retention_basis:po.retention_basis||'EX_VAT', original_currency:po.original_currency||'SAR', fx_rate:String(po.fx_rate||1) })
    setIpoItems((po.incoming_po_items||[]).length?po.incoming_po_items.map(r=>({...r,id:r.id||crypto.randomUUID()})):[emptyItem()])
    if(po.department_id) supabase.from('projects').select('id,project_number,project_name').eq('entity_id',entityId).order('project_number').then(({data})=>setIpoProjects(data||[]))
    if(po.project_id) supabase.from('site_masters').select('id,sm_id,site_name').eq('project_id',po.project_id).order('sm_id').then(({data})=>setIpoSites(data||[]))
    setIpoStep(1); setShowIpoForm(true)
  }
  function openNewOpo(){ setEditOpo(null); setOpoForm(EMPTY_OPO); setOpoItems([emptyItem()]); setOpoProjects([]); setOpoSites([]); setOpoDeptEmps([]); setOpoStep(1); setShowOpoBanner(true) }
  function openEditOpo(po){
    setEditOpo(po)
    const cat=po.category||''
    setOpoForm({ po_date:po.po_date||TODAY, department_id:po.department_id||'', dept_head_id:po.dept_head_id||'', requested_by:po.requested_by||'', project_id:po.project_id||'', site_id:po.site_id||'', supplier_id:po.supplier_id||'', category:cat, job_type:po.job_type||'', payment_terms:po.payment_terms||'CREDIT', notes:po.notes||'' })
    setOpoItems((po.outgoing_po_items||[]).length?po.outgoing_po_items.map(r=>({...r,id:r.id||crypto.randomUUID()})):[emptyItem()])
    if(cat){
      setFilteredSuppliers(suppliers.filter(s=>s.vendor_type===cat))
      const sup=suppliers.find(s=>s.id===po.supplier_id)
      const base=allJobTypes.filter(j=>j.contractor_type===cat).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99)).map(j=>j.job_type_name)
      if(sup?.specialization){ const idx=base.findIndex(j=>j.toLowerCase()===sup.specialization.toLowerCase()); if(idx>0){const m=base.splice(idx,1);base.unshift(m[0])} }
      setOpoJobTypes(base)
    }
    setOpoStep(1); setShowOpoForm(true)
  }

  async function handlePdfFile(file){
    if(!file) return
    setPdfFile(file); setPdfError(''); setPdfStage('reading')
    try {
      const text=await extractPdfText(file)
      const parsed=parsePO(text)
      setPdfParsed(parsed)
      if(parsed.contractor_po_number) setPdfContractorPoNum(parsed.contractor_po_number)
      if(parsed.po_date) setPdfPoDate(parsed.po_date)
      if(parsed.total_value) setPdfTotalValue(String(parsed.total_value))
      if(parsed.notes) setPdfNotes(parsed.notes)
      if(parsed.line_items?.length) setPdfLineItems(parsed.line_items.map(r=>({id:crypto.randomUUID(),job_type:r.job_type||'',description:r.description||'',qty:String(r.qty||1),unit_price:String(r.unit_price||0),newJobType:''})))
      if(parsed.vat_number||parsed.contractor_name){
        const vat=parsed.vat_number||''
        const name=(parsed.contractor_name||'').toLowerCase()
        const match=contractors.find(c=>(vat&&c.contact_email?.includes(vat))||(name&&c.contractor_name?.toLowerCase().includes(name)))
        if(match) setPdfContractorId(match.id)
      }
      setPdfStage('review')
    } catch(e){
      setPdfError('Failed to read PDF: '+e.message); setPdfStage('upload')
    }
  }
  function resetPdfImport(){ setPdfStage('upload'); setPdfFile(null); setPdfParsed(null); setPdfError(''); setPdfContractorId(''); setPdfContractorPoNum(''); setPdfPoDate(TODAY); setPdfTotalValue(''); setPdfDeptId(''); setPdfProjectId(''); setPdfPaymentDays('30'); setPdfNotes(''); setPdfLineItems([emptyItem()]); setPdfSaveError('') }
  async function savePdfImport(){
    if(!pdfContractorId||!pdfContractorPoNum||!pdfDeptId){ setPdfSaveError('Contractor, PO number and Department are required.'); return }
    if(pdfLineItems.some(r=>!r.description)){ setPdfSaveError('All line items need a description.'); return }
    setPdfStage('saving'); setPdfSaveError('')
    const dup=incomingPOs.find(p=>p.contractor_id===pdfContractorId&&p.contractor_po_number===pdfContractorPoNum)
    if(dup){ setPdfSaveError('This PO number already exists for this contractor.'); setPdfStage('review'); return }
    const subtotal=pdfLineItems.reduce((s,r)=>(s+(parseFloat(r.qty)||0)*(parseFloat(r.unit_price)||0)),0)
    const {data:newPo}=await supabase.from('incoming_pos').insert({ entity_id:entityId, po_date:pdfPoDate, department_id:pdfDeptId, project_id:pdfProjectId||null, contractor_id:pdfContractorId, contractor_po_number:pdfContractorPoNum, payment_terms:'CREDIT', payment_terms_days:parseInt(pdfPaymentDays)||30, original_currency:pdfCurrency, fx_rate:parseFloat(pdfFxRate)||1, notes:pdfNotes, subtotal, total_value:subtotal, billing_mode:'QTY', retention_pct:0, status:'ACTIVE' }).select('id').single()
    if(!newPo?.id){ setPdfSaveError('Failed to save PO.'); setPdfStage('review'); return }
    const itemRows=pdfLineItems.filter(r=>r.description&&r.description.length>=4).map((r,i)=>({ incoming_po_id:newPo.id, sort_order:i, job_type:r.job_type||'', description:r.description, qty:parseFloat(r.qty)||1, unit_price:parseFloat(r.unit_price)||0 }))
    if(itemRows.length) await supabase.from('incoming_po_items').insert(itemRows)
    if(pdfFile&&driveUpload){
      try {
        const url=await driveUpload(pdfFile,'po-sub-contractors',`${pdfContractorPoNum}.pdf`)
        if(url) await supabase.from('incoming_pos').update({attachment_url:url,attachment_name:pdfFile.name}).eq('id',newPo.id)
      } catch(_){}
    }
    setPdfStage('done'); load()
  }

  const filteredIPO=incomingPOs.filter(p=>{
    if(ipoFilter!=='ALL'&&p.status!==ipoFilter) return false
    if(ipoDeptFilter&&p.department_id!==ipoDeptFilter) return false
    if(ipoDateFrom&&p.po_date<ipoDateFrom) return false
    if(ipoDateTo&&p.po_date>ipoDateTo) return false
    if(ipoSearch){ const q=ipoSearch.toLowerCase(); const name=p.contractors?.contractor_name?.toLowerCase()||''; const pono=p.contractor_po_number?.toLowerCase()||''; const proj=p.projects?.project_number?.toLowerCase()||''; if(!name.includes(q)&&!pono.includes(q)&&!proj.includes(q)) return false }
    return true
  })
  const filteredOPO=outgoingPOs.filter(p=>{
    if(opoFilter!=='ALL'&&p.approval_status!==opoFilter) return false
    if(opoDeptFilter&&p.department_id!==opoDeptFilter) return false
    if(opoDateFrom&&p.po_date<opoDateFrom) return false
    if(opoDateTo&&p.po_date>opoDateTo) return false
    if(opoSearch){ const q=opoSearch.toLowerCase(); const name=p.contractors?.contractor_name?.toLowerCase()||''; const pono=p.po_number?.toLowerCase()||''; if(!name.includes(q)&&!pono.includes(q)) return false }
    return true
  })

  const ipoTotal=filteredIPO.reduce((s,p)=>s+(p.total_value||0),0)
  const ipoCount=filteredIPO.length
  const ipoWithCO=filteredIPO.filter(p=>p.has_change_orders).length
  const ipoAvg=ipoCount?ipoTotal/ipoCount:0
  const opoPending=filteredOPO.filter(p=>p.approval_status==='PENDING_DH').length
  const opoIssued=filteredOPO.filter(p=>p.approval_status==='ISSUED').length
  const opoTotal=filteredOPO.reduce((s,p)=>s+(p.total_value||0),0)
  const opoApproved=filteredOPO.filter(p=>p.approval_status==='DH_APPROVED').length

  function toggleIPO(id){ setExpandedIPO(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n }) }
  function toggleOPO(id){ setExpandedOPO(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n }) }

  if(loading) return <div style={{ padding:40, textAlign:'center', color:'#6b7c93', fontFamily:PP }}>Loading Purchase Orders…</div>

  const tdS={ padding:'10px 12px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:PP }
  const thS=(c)=>({ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.4px', background:c, color:'#e8f0f8', whiteSpace:'nowrap' })
  const kpiCard=(grad,icon,val,label)=>(
    <div style={{ background:`linear-gradient(${grad})`, borderRadius:12, padding:'14px 16px', color:'#fff', boxShadow:'0 4px 12px rgba(0,0,0,0.15)', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', right:-10, top:-10, width:60, height:60, borderRadius:'50%', background:'rgba(255,255,255,0.1)' }} />
      <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:15, fontWeight:900, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:PP }}>{val}</div>
      <div style={{ fontSize:10, opacity:0.8, marginTop:2, fontWeight:600, fontFamily:PP }}>{label}</div>
    </div>
  )

  return (
    <div style={{ padding:'0 0 40px', fontFamily:PP }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap')`}</style>

      {/* ── Opening Banners — one per form type ── */}
      <PageBanner
        isOpen={showIpoBanner}
        onClose={() => setShowIpoBanner(false)}
        onStart={() => { setShowIpoBanner(false); setShowIpoForm(true) }}
        onStartAlt={() => { setShowIpoBanner(false); resetPdfImport(); setShowPdfImport(true) }}
        startAltLabel="Import from PDF"
        chapterL1="#70A5A6"
        chapterL2="#EAF3F2"
        moduleColor={MC}
        chapterLabel="Operations"
        formTitle={['Incoming', 'Purchase', 'Order']}
        steps={['PO Details', 'Billing & Terms', 'Line Items']}
        icon="📥"
        description="Register a Purchase Order received from a Main Contractor. Drives the AR billing pipeline."
      />
      <PageBanner
        isOpen={showOpoBanner}
        onClose={() => setShowOpoBanner(false)}
        onStart={() => { setShowOpoBanner(false); setShowOpoForm(true) }}
        chapterL1="#70A5A6"
        chapterL2="#EAF3F2"
        moduleColor={MC}
        chapterLabel="Operations"
        formTitle={['Outgoing', 'Purchase', 'Order']}
        steps={['Header', 'Line Items', 'Approval']}
        icon="📤"
        description="Issue a Purchase Order to a Supplier or Sub-Contractor for goods and services."
      />

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div>
          <div style={{ fontSize:12, color:'#6b7c93', marginTop:3 }}>Incoming (Receivable) · Outgoing (Payable)</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {poTab==='incoming' && (
            <button onClick={()=>{ resetPdfImport(); setShowPdfImport(true) }}
              style={{ padding:'10px 18px', borderRadius:10, border:`1.5px solid ${INC_PRI}`, background:'#fff', color:INC_PRI, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:PP }}>
              Import from PDF
            </button>
          )}
          <button onClick={poTab==='incoming'?openNewIpo:openNewOpo}
            style={{ ...S.btn(poTab==='incoming'?INC_PRI:OUT_PRI), padding:'10px 22px', fontSize:13, borderRadius:10 }}>
            {poTab==='incoming'?'+ New Incoming PO':'+ New Outgoing PO'}
          </button>
        </div>
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'2px solid #e8edf2' }}>
        {[['incoming','Incoming POs',INC_PRI],['outgoing','Outgoing POs',OUT_PRI]].map(([key,label,color])=>(
          <button key={key} onClick={()=>setPoTab(key)}
            style={{ padding:'10px 24px', borderRadius:'10px 10px 0 0', border:'none', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:PP,
              background:poTab===key?color:'transparent', color:poTab===key?'#fff':'#6b7c93',
              borderBottom:poTab===key?`3px solid ${color}`:'3px solid transparent', transition:'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {poTab==='incoming' && (
        <>
          <div style={{ background:'#fff', border:`1.5px solid ${INC_BOX1}30`, borderRadius:12, padding:'12px 16px', marginBottom:14 }}>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
              {[['ALL','All'],['ACTIVE','Active'],['INVOICED','Invoiced'],['CLOSED','Closed'],['CANCELLED','Cancelled']].map(([v,l])=>(
                <button key={v} onClick={()=>setIpoFilter(v)}
                  style={{ padding:'5px 14px', borderRadius:20, border:'none', fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:PP,
                    background:ipoFilter===v?INC_PRI:'#f0f4f8', color:ipoFilter===v?'#fff':'#6b7c93' }}>{l}</button>
              ))}
              <div style={{ marginLeft:'auto', fontSize:12, color:INC_PRI, fontWeight:700, alignSelf:'center' }}>
                {filteredIPO.length} records · SAR {fmt(filteredIPO.reduce((s,p)=>s+(p.total_value||0),0))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input style={{ ...S.inp, width:220, padding:'7px 10px', fontSize:12 }} placeholder="Search contractor, PO#…" value={ipoSearch} onChange={e=>setIpoSearch(e.target.value)} />
              <select style={{ ...S.inp, width:180, padding:'7px 10px', fontSize:12 }} value={ipoDeptFilter} onChange={e=>setIpoDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
              </select>
              <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700 }}>From</span>
              <input type="date" style={{ ...S.inp, width:140, padding:'7px 8px', fontSize:12 }} value={ipoDateFrom} onChange={e=>setIpoDateFrom(e.target.value)} />
              <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700 }}>To</span>
              <input type="date" style={{ ...S.inp, width:140, padding:'7px 8px', fontSize:12 }} value={ipoDateTo} onChange={e=>setIpoDateTo(e.target.value)} />
              {(ipoSearch||ipoDeptFilter||ipoDateFrom||ipoDateTo||ipoFilter!=='ALL') && (
                <button onClick={()=>{setIpoSearch('');setIpoDeptFilter('');setIpoDateFrom('');setIpoDateTo('');setIpoFilter('ALL')}}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #e57373', background:'#fff', color:'#c62828', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
            {kpiCard('135deg,#0079BC,#005a8e','💰',`SAR ${fmt(ipoTotal)}`,'Total Value')}
            {kpiCard('135deg,#1D9E75,#0F6E56','📥',ipoCount,'POs in View')}
            {kpiCard('135deg,#BA7517,#854F0B','🔄',ipoWithCO,'With Change Orders')}
            {kpiCard('135deg,#185FA5,#0C447C','📊',`SAR ${fmt(ipoAvg)}`,'Avg PO Value')}
          </div>

          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e8edf2', overflow:'hidden' }}>
            {filteredIPO.length===0 ? (
              <div style={{ textAlign:'center', padding:50, color:'#aab2bd' }}>
                <div style={{ fontSize:36, marginBottom:12 }}>📥</div>
                <div style={{ fontWeight:700 }}>No Incoming POs</div>
                <div style={{ fontSize:12, marginTop:6 }}>New Incoming PO or Import from PDF</div>
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                <colgroup>
                  <col style={{ width:95 }}/><col style={{ width:55 }}/><col style={{ width:'21%' }}/>
                  <col style={{ width:'14%' }}/><col style={{ width:'9%' }}/><col style={{ width:115 }}/>
                  <col style={{ width:105 }}/><col style={{ width:85 }}/><col style={{ width:30 }}/>
                </colgroup>
                <thead><tr>
                  {['Date','Dept','Contractor','Contractor PO #','Project','Value (SAR)','Invoiced','Status',''].map((h,hi)=>(
                    <th key={hi} style={{ ...thS(INC_PRI), textAlign:hi>=5&&hi<=6?'right':'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredIPO.map((po,ri)=>{
                    const cos=po.incoming_po_change_orders||[]
                    const totalWithCO=(po.original_value||po.total_value||0)+cos.reduce((s,c)=>s+(c.co_value||0),0)
                    const totalVal=po.has_change_orders?totalWithCO:(po.total_value||0)
                    const invoiced=po.total_invoiced_ex_vat||0
                    const pct=totalVal>0?Math.min(100,(invoiced/totalVal)*100):0
                    const bColor=pct>=100?'#2e7d32':pct>0?INC_PRI:'#aab2bd'
                    const isOpen=expandedIPO.has(po.id)
                    const zbg=ri%2!==0?'#f9fcfb':'#fff'
                    return (
                      <React.Fragment key={po.id}>
                        <tr onClick={()=>toggleIPO(po.id)} style={{ background:zbg, cursor:'pointer' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#eaf5f1'}
                          onMouseLeave={e=>e.currentTarget.style.background=zbg}>
                          <td style={tdS}><span style={{ fontSize:11, color:'#6b7c93' }}>{po.po_date}</span></td>
                          <td style={tdS}>{po.departments&&<span style={{ background:`${INC_PRI}18`, color:INC_PRI, padding:'2px 7px', borderRadius:10, fontSize:10, fontWeight:800 }}>{po.departments.dept_code}</span>}</td>
                          <td style={{ ...tdS, fontWeight:700 }}>{po.contractors?.contractor_name||'—'}</td>
                          <td style={{ ...tdS, fontFamily:'monospace', fontWeight:700, color:INC_PRI }}>{po.contractor_po_number}</td>
                          <td style={{ ...tdS, fontSize:11 }}>{po.projects?.project_number||'—'}</td>
                          <td style={{ ...tdS, fontWeight:800, textAlign:'right' }}>
                            {fmt(totalVal)}
                            {po.has_change_orders&&<span style={{ marginLeft:5, fontSize:9, background:'#f3e5f5', color:'#0079BC', padding:'1px 5px', borderRadius:8, fontWeight:800 }}>+{cos.length}CO</span>}
                          </td>
                          <td style={{ ...tdS, textAlign:'right' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:bColor }}>{fmt(invoiced)}</div>
                            <div style={{ width:'100%', height:3, background:'#f0f4f8', borderRadius:2, marginTop:2 }}>
                              <div style={{ width:`${pct}%`, height:3, background:bColor, borderRadius:2 }} />
                            </div>
                            <div style={{ fontSize:9, color:bColor, marginTop:1 }}>{pct.toFixed(0)}%</div>
                          </td>
                          <td style={tdS}><StatusPill map={IPO_STATUS} val={po.status} /></td>
                          <td style={{ ...tdS, textAlign:'center', color:INC_PRI, fontSize:13 }}>{isOpen?'▲':'▼'}</td>
                        </tr>
                        {isOpen&&(
                          <tr><td colSpan={9} style={{ padding:0, background:'#f3faf7' }}>
                            <div style={{ padding:'16px 20px', borderTop:`2px solid ${INC_PRI}20` }}>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
                                <DetailField label="Contractor PO #" value={po.contractor_po_number} mono />
                                <DetailField label="Job Type" value={po.job_type||'—'} />
                                <DetailField label="Payment Terms" value={PAYMENT_TERMS.find(t=>t.value===po.payment_terms)?.label||po.payment_terms} />
                                <DetailField label="Dept Head" value={po.employees?.full_name_en||'—'} />
                              </div>
                              {po.description&&<div style={{ fontSize:12, color:'#445566', marginBottom:12, padding:'8px 12px', background:'#e8f5e9', borderRadius:8 }}>{po.description}</div>}
                              {(po.incoming_po_items||[]).length>0&&(
                                <div style={{ marginBottom:12 }}>
                                  <div style={{ fontSize:11, fontWeight:800, color:INC_PRI, textTransform:'uppercase', marginBottom:6 }}>Line Items</div>
                                  {po.incoming_po_items.map((r,ri2)=>{
                                    const qi=r.qty_invoiced||0, qr=Math.max(0,(r.qty||0)-qi), pb=(r.qty||0)>0?(qi/(r.qty||0))*100:0, done=qr<=0
                                    return (
                                      <div key={r.id} style={{ background:done?'#f5fdf5':'#fff', border:`1px solid ${done?'#c8e6c9':'#e0e7ef'}`, borderRadius:8, padding:'8px 12px', marginBottom:6 }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                          <div style={{ fontSize:12, fontWeight:700 }}>{r.description}</div>
                                          <span style={{ background:done?'#e8f5e9':'#fff3e0', color:done?'#2e7d32':'#e65100', fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>{done?'Fully Billed':`${qr} Remaining`}</span>
                                        </div>
                                        <div style={{ width:'100%', height:3, background:'#e0e7ef', borderRadius:2, marginBottom:4 }}>
                                          <div style={{ width:`${Math.min(100,pb)}%`, height:3, background:done?'#2e7d32':INC_PRI, borderRadius:2 }} />
                                        </div>
                                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                                          {[['Ordered',String(r.qty),'#546e7a'],['Invoiced',qi>0?String(qi):'—',INC_PRI],['Remaining',done?'Done':String(qr),done?'#2e7d32':'#e65100'],['Unit Price',`SAR ${fmt(r.unit_price)}`,'#1a2e3d']].map(([lb,v,cl])=>(
                                            <div key={lb} style={{ textAlign:'center' }}>
                                              <div style={{ fontSize:9, color:'#aab2bd', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{lb}</div>
                                              <div style={{ fontSize:11, fontWeight:800, color:cl }}>{v}</div>
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{ textAlign:'right', fontSize:11, fontWeight:900, marginTop:4, paddingTop:4, borderTop:'1px solid #eef2f7' }}>SAR {fmt(r.total||(r.qty||0)*(r.unit_price||0))}</div>
                                      </div>
                                    )
                                  })}
                                  <div style={{ textAlign:'right', fontWeight:900, fontSize:13, color:INC_PRI, marginTop:6 }}>Total: SAR {fmt(po.total_value)}</div>
                                </div>
                              )}
                              {cos.length>0&&(
                                <div style={{ marginBottom:12 }}>
                                  <div style={{ fontSize:11, fontWeight:800, color:'#0079BC', textTransform:'uppercase', marginBottom:6 }}>Change Orders</div>
                                  {cos.map(co=>(
                                    <div key={co.id} style={{ background:'#faf5ff', border:'1px solid #e1d5f0', borderRadius:8, padding:'8px 12px', marginBottom:6 }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                        <span style={{ fontWeight:800, color:'#0079BC', fontSize:12 }}>{co.co_number}</span>
                                        <span style={{ fontSize:11, color:'#6b7c93' }}>{co.co_date}</span>
                                        <span style={{ fontWeight:800, fontSize:13, color:'#0079BC' }}>SAR {fmt(co.co_value)}</span>
                                      </div>
                                      <div style={{ fontSize:11, color:'#445566', marginTop:4 }}>{co.description}</div>
                                      <div style={{ fontSize:10, color:'#6b7c93', marginTop:3 }}>Original: SAR {fmt(co.original_po_value)} → Revised: SAR {fmt(co.cumulative_value)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                                <button onClick={e=>{e.stopPropagation();openEditIpo(po)}} style={S.btn(INC_PRI)}>Edit</button>
                                <button onClick={e=>{e.stopPropagation();setCoParent(po.id);setCoForm(EMPTY_CO);setShowCoForm(true)}} style={S.btn('#0079BC')}>+ Change Order</button>
                                {po.attachment_url&&<a href={po.attachment_url} target="_blank" rel="noreferrer" style={{ ...S.btn('#2e7d32'), textDecoration:'none' }}>Attachment</a>}
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {poTab==='outgoing' && (
        <>
          <div style={{ background:'#fff', border:`1.5px solid ${OUT_BOX1}30`, borderRadius:12, padding:'12px 16px', marginBottom:14 }}>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
              {[['ALL','All'],['PENDING_DH','Pending DH'],['DH_APPROVED','DH Approved'],['ISSUED','Issued'],['REJECTED','Rejected']].map(([v,l])=>(
                <button key={v} onClick={()=>setOpoFilter(v)}
                  style={{ padding:'5px 14px', borderRadius:20, border:'none', fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:PP,
                    background:opoFilter===v?OUT_PRI:'#f0f4f8', color:opoFilter===v?'#fff':'#6b7c93' }}>{l}</button>
              ))}
              <div style={{ marginLeft:'auto', fontSize:12, color:OUT_PRI, fontWeight:700, alignSelf:'center' }}>
                {filteredOPO.length} records · SAR {fmt(opoTotal)}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input style={{ ...S.inp, width:220, padding:'7px 10px', fontSize:12 }} placeholder="Search supplier, PO#…" value={opoSearch} onChange={e=>setOpoSearch(e.target.value)} />
              <select style={{ ...S.inp, width:180, padding:'7px 10px', fontSize:12 }} value={opoDeptFilter} onChange={e=>setOpoDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
              </select>
              <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700 }}>From</span>
              <input type="date" style={{ ...S.inp, width:140, padding:'7px 8px', fontSize:12 }} value={opoDateFrom} onChange={e=>setOpoDateFrom(e.target.value)} />
              <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700 }}>To</span>
              <input type="date" style={{ ...S.inp, width:140, padding:'7px 8px', fontSize:12 }} value={opoDateTo} onChange={e=>setOpoDateTo(e.target.value)} />
              {(opoSearch||opoDeptFilter||opoDateFrom||opoDateTo||opoFilter!=='ALL')&&(
                <button onClick={()=>{setOpoSearch('');setOpoDeptFilter('');setOpoDateFrom('');setOpoDateTo('');setOpoFilter('ALL')}}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #e57373', background:'#fff', color:'#c62828', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
            {kpiCard('135deg,#0079BC,#005a8e','💳',`SAR ${fmt(opoTotal)}`,'Total Committed')}
            {kpiCard('135deg,#185FA5,#0C447C','⏳',opoPending,'Pending DH')}
            {kpiCard('135deg,#993C1D,#712B13','✅',opoApproved,'DH Approved')}
            {kpiCard('135deg,#3B6D11,#27500A','🟢',opoIssued,'Issued')}
          </div>

          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e8edf2', overflow:'hidden' }}>
            {filteredOPO.length===0 ? (
              <div style={{ textAlign:'center', padding:50, color:'#aab2bd' }}>
                <div style={{ fontSize:36, marginBottom:12 }}>📤</div>
                <div style={{ fontWeight:700 }}>No Outgoing POs yet</div>
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                <colgroup>
                  <col style={{ width:'19%' }}/><col style={{ width:95 }}/><col style={{ width:58 }}/>
                  <col style={{ width:'23%' }}/><col style={{ width:'11%' }}/><col style={{ width:115 }}/>
                  <col style={{ width:110 }}/><col style={{ width:30 }}/>
                </colgroup>
                <thead><tr>
                  {['PO Number','Date','Dept','Supplier','Category','Value (SAR)','Status',''].map((h,hi)=>(
                    <th key={hi} style={{ ...thS(OUT_PRI), textAlign:hi===5?'right':'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredOPO.map((po,ri)=>{
                    const isOpen=expandedOPO.has(po.id), zbg=ri%2!==0?'#f7f9ff':'#fff'
                    return (
                      <React.Fragment key={po.id}>
                        <tr onClick={()=>toggleOPO(po.id)} style={{ background:zbg, cursor:'pointer' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#eaeffa'}
                          onMouseLeave={e=>e.currentTarget.style.background=zbg}>
                          <td style={{ ...tdS, fontFamily:'monospace', fontWeight:800, color:OUT_PRI, fontSize:11 }}>{po.po_number||'—'}</td>
                          <td style={{ ...tdS, fontSize:11, color:'#6b7c93' }}>{po.po_date}</td>
                          <td style={tdS}>{po.departments&&<span style={{ background:`${OUT_PRI}18`, color:OUT_PRI, padding:'2px 7px', borderRadius:10, fontSize:10, fontWeight:800 }}>{po.departments.dept_code}</span>}</td>
                          <td style={{ ...tdS, fontWeight:700 }}>{po.contractors?.contractor_name||'—'}</td>
                          <td style={{ ...tdS, fontSize:11 }}>{CATEGORIES.find(c=>c.value===po.category)?.label||po.category||'—'}</td>
                          <td style={{ ...tdS, fontWeight:800, textAlign:'right' }}>{fmt(po.total_value)}</td>
                          <td style={tdS}><StatusPill map={OPO_STATUS} val={po.approval_status} /></td>
                          <td style={{ ...tdS, textAlign:'center', color:OUT_PRI, fontSize:13 }}>{isOpen?'▲':'▼'}</td>
                        </tr>
                        {isOpen&&(
                          <tr><td colSpan={8} style={{ padding:0, background:'#f2f5fc' }}>
                            <div style={{ padding:'16px 20px', borderTop:`2px solid ${OUT_PRI}20` }}>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
                                <DetailField label="PO Number" value={po.po_number} mono />
                                <DetailField label="Requested By" value={allEmployees.find(e=>e.id===po.requested_by)?.full_name_en||'—'} />
                                <DetailField label="Payment Terms" value={PAYMENT_TERMS.find(t=>t.value===po.payment_terms)?.label||po.payment_terms} />
                                <DetailField label="Job Type" value={po.job_type||'—'} />
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
                                <DetailField label="Project" value={po.projects?.project_number?`${po.projects.project_number} — ${po.projects.project_name}`:'—'} />
                                <DetailField label="Site" value={po.site_masters?.sm_id||'—'} />
                                <DetailField label="Source" value={po.source==='FIELD_FORM'?'Field Form':'Desktop'} />
                              </div>
                              {(po.outgoing_po_items||[]).length>0&&(
                                <div style={{ marginBottom:12 }}>
                                  <div style={{ fontSize:11, fontWeight:800, color:OUT_PRI, textTransform:'uppercase', marginBottom:6 }}>Line Items</div>
                                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                    <thead><tr style={{ background:`${OUT_PRI}10` }}>
                                      {['Job Type','Description','Qty','Unit Price','Total'].map(h=><th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:10, fontWeight:800, color:OUT_PRI }}>{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                      {po.outgoing_po_items.map(r=>(
                                        <tr key={r.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                                          <td style={{ padding:'6px 10px', fontSize:11 }}>{r.job_type||'—'}</td>
                                          <td style={{ padding:'6px 10px', fontSize:11 }}>{r.description}</td>
                                          <td style={{ padding:'6px 10px', fontSize:11, textAlign:'right' }}>{r.qty}</td>
                                          <td style={{ padding:'6px 10px', fontSize:11, textAlign:'right' }}>SAR {fmt(r.unit_price)}</td>
                                          <td style={{ padding:'6px 10px', fontSize:11, textAlign:'right', fontWeight:700 }}>SAR {fmt(r.total||r.qty*r.unit_price)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div style={{ textAlign:'right', fontWeight:900, fontSize:13, color:OUT_PRI, marginTop:6 }}>Total: SAR {fmt(po.total_value)}</div>
                                </div>
                              )}
                              {po.notes&&<div style={{ fontSize:12, color:'#445566', marginBottom:10, padding:'8px 12px', background:'#e8edf5', borderRadius:8 }}>{po.notes}</div>}
                              {po.rejection_reason&&<div style={{ fontSize:12, color:'#c62828', marginBottom:10, padding:'8px 12px', background:'#ffebee', borderRadius:8 }}>Rejection: {po.rejection_reason}</div>}
                              <div style={{ display:'flex', gap:8 }}>
                                {po.approval_status==='PENDING_DH'&&<>
                                  <button onClick={e=>{e.stopPropagation();updateOpoStatus(po.id,'DH_APPROVED')}} style={S.btn('#0277bd')}>Approve</button>
                                  <button onClick={e=>{e.stopPropagation();const r=prompt('Rejection reason?');if(r)updateOpoStatus(po.id,'REJECTED',r)}} style={S.btn('#c62828')}>Reject</button>
                                </>}
                                {po.approval_status==='DH_APPROVED'&&<button onClick={e=>{e.stopPropagation();updateOpoStatus(po.id,'ISSUED')}} style={S.btn('#2e7d32')}>Mark as Issued</button>}
                                {['PENDING_DH','DH_APPROVED'].includes(po.approval_status)&&<button onClick={e=>{e.stopPropagation();openEditOpo(po)}} style={S.btn('#6b7c93')}>Edit</button>}
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showIpoForm&&(()=>{
        const PRI=INC_PRI, BOX1=INC_BOX1, BOX2=INC_BOX2
        const STEPS=['PO Details','Billing & Terms','Line Items']
        const STEP_DESC=['Contractor, PO reference, date, department and project.','Payment terms, currency, billing mode and retention %.','Add line items with job type, quantity and unit price.']
        return (
          <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)setShowIpoForm(false)}}>
            <div style={{ background:'#70A5A6', borderRadius:18, padding:8, width:960, maxWidth:'calc(100vw - 24px)', boxShadow:'0 24px 80px rgba(0,0,0,0.35)' }}>
              
                <div style={{ background:'#EAF3F2', borderRadius:12, display:'flex', position:'relative', overflow:'hidden', minHeight:520 }}>
                    <div style={{ position:'absolute', top:0, right:0, width:220, height:185, background:'#0079BC', borderRadius:'0 12px 0 90px', zIndex:1 }} />
                    <div style={{ width:260, flexShrink:0, padding:'20px 20px 16px', display:'flex', flexDirection:'column', position:'relative', zIndex:2, fontFamily:PP }}>
                      <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.5, textTransform:'uppercase', marginBottom:4 }}>Ratal Advanced Technologies</div>
                      <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Operations</div>
                      <div style={{ fontSize:22, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6, fontFamily:PP }}>{STEPS[ipoStep-1]}</div>
                      <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[ipoStep-1]}</div>
                      <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1, marginBottom:14 }}>STEP {ipoStep} OF {STEPS.length}</div>
                      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                        {STEPS.map((name,idx)=>{
                          const sn=idx+1, isAct=ipoStep===sn, isDone=ipoStep>sn
                          return (
                            <div key={sn} onClick={()=>isDone&&setIpoStep(sn)} style={{ display:'flex', alignItems:'center', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft:isAct?'3px solid #0079BC':isDone?'3px solid rgba(0,121,188,0.35)':'3px solid rgba(0,0,0,0.08)' }}>
                              <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#0d1f1a':isDone?'#4a7a6a':'#8aabba' }}>{name}</span>
                              {isDone&&<span style={{ marginLeft:6, fontSize:10, color:'#4a7a6a' }}>✓</span>}
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize:10, color:'#8aabba', marginTop:8, fontFamily:PP }}>Register the received PO in Accounts Receivable</div>
                    </div>
                    <div style={{ flex:1, background:'#fff', borderRadius:10, margin:'56px 10px 10px 0', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:3 }}>
                      <div style={{ padding:'20px 24px 0', flexShrink:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <div style={{ fontSize:16, fontWeight:900, color:'#fff', marginBottom:10, fontFamily:PP }}>{STEPS[ipoStep-1]}</div>
                          <button onClick={()=>setShowIpoForm(false)} style={{ background:'#f0f4f8', border:'none', color:'#8aabba', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                        </div>
                        <div style={{ height:1, background:'#e8edf5' }} />
                      </div>
                      <div style={{ flex:1, overflowY:'auto', padding:'16px 24px 14px', fontFamily:PP }}>
                      {ipoStep===1&&(
                        <>
                          {/* Row 1: Contractor + PO# — the primary identifiers */}
                          <div style={S.row}>
                            <div style={{ ...S.col, flex:1.4 }}>
                              <label style={S.label}>Contractor *</label>
                              <select style={{ ...S.inp, borderColor:`${PRI}55`, fontWeight:600 }} value={ipoForm.contractor_id} onChange={e=>setIpoForm(f=>({...f,contractor_id:e.target.value}))}>
                                <option value="">— Select Contractor —</option>
                                {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_code?`[${c.contractor_code}] `:''}{c.contractor_name}</option>)}
                              </select>
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Contractor PO Number *</label>
                              <input style={{ ...S.inp, fontFamily:'monospace', fontWeight:700, color:PRI, borderColor:`${PRI}55` }}
                                value={ipoForm.contractor_po_number} onChange={e=>setIpoForm(f=>({...f,contractor_po_number:e.target.value}))}
                                placeholder="e.g. NOK-2026-00234" />
                            </div>
                          </div>
                          {/* Row 2: Date + Department + Dept Head */}
                          <div style={S.row}>
                            <div style={S.col}>
                              <label style={S.label}>PO Date *</label>
                              <input type="date" style={S.inp} value={ipoForm.po_date} onChange={e=>setIpoForm(f=>({...f,po_date:e.target.value}))} />
                            </div>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Department *</label>
                              <select style={S.inp} value={ipoForm.department_id} onChange={e=>onIpoDeptChange(e.target.value)}>
                                <option value="">— Select Department —</option>
                                {departments.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
                              </select>
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Dept Head</label>
                              <select style={{ ...S.inp, background:'#f8faff' }} value={ipoForm.dept_head_id} onChange={e=>setIpoForm(f=>({...f,dept_head_id:e.target.value}))}>
                                <option value="">— Auto-filled —</option>
                                {allEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}</option>)}
                              </select>
                            </div>
                          </div>
                          {/* Row 3: Project + Site */}
                          <div style={S.row}>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Project</label>
                              <select style={S.inp} value={ipoForm.project_id} onChange={e=>onIpoProjectChange(e.target.value)} disabled={!ipoForm.department_id}>
                                <option value="">{ipoForm.department_id?'— Select Project —':'— Select Dept First —'}</option>
                                {ipoProjects.map(p=><option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>)}
                              </select>
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Site (Optional)</label>
                              <select style={S.inp} value={ipoForm.site_id} onChange={e=>setIpoForm(f=>({...f,site_id:e.target.value}))} disabled={!ipoForm.project_id}>
                                <option value="">{ipoForm.project_id?'— Select Site —':'— Select Project First —'}</option>
                                {ipoSites.map(s=><option key={s.id} value={s.id}>{s.sm_id}{s.site_name?` — ${s.site_name}`:''}</option>)}
                              </select>
                            </div>
                          </div>
                          {/* Description */}
                          <div style={{ marginBottom:12 }}>
                            <label style={S.label}>Description</label>
                            <textarea style={{ ...S.inp, minHeight:60, resize:'vertical' }}
                              value={ipoForm.description} onChange={e=>setIpoForm(f=>({...f,description:e.target.value}))}
                              placeholder="Brief scope description…" />
                          </div>
                        </>
                      )}
                      {ipoStep===2&&(
                        <>
                          <div style={S.row}>
                            <div style={S.col}>
                              <label style={S.label}>Payment Terms</label>
                              <select style={S.inp} value={ipoForm.payment_terms} onChange={e=>setIpoForm(f=>({...f,payment_terms:e.target.value}))}>
                                {PAYMENT_TERMS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Credit Days</label>
                              <input type="number" min="0" max="365" style={S.inp} value={ipoForm.payment_terms_days} onChange={e=>setIpoForm(f=>({...f,payment_terms_days:e.target.value}))} />
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>PO Currency</label>
                              <select style={S.inp} value={ipoForm.original_currency} onChange={e=>setIpoForm(f=>({...f,original_currency:e.target.value}))}>
                                {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            {ipoForm.original_currency!=='SAR'&&(
                              <div style={S.col}>
                                <label style={S.label}>FX Rate (1 {ipoForm.original_currency} = SAR)</label>
                                <input type="number" min="0" step="0.0001" style={{ ...S.inp, fontWeight:700, color:'#e65100' }}
                                  value={ipoForm.fx_rate} onChange={e=>setIpoForm(f=>({...f,fx_rate:e.target.value}))} />
                              </div>
                            )}
                          </div>
                          <div style={S.row}>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Billing Mode</label>
                              <select style={S.inp} value={ipoForm.billing_mode} onChange={e=>setIpoForm(f=>({...f,billing_mode:e.target.value}))}>
                                {BILLING_MODES.map(m=><option key={m.value} value={m.value}>{m.label} — {m.desc}</option>)}
                              </select>
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Retention %</label>
                              <input type="number" min="0" max="50" step="0.5" style={{ ...S.inp, fontWeight:700, color:'#0079BC' }}
                                value={ipoForm.retention_pct} onChange={e=>setIpoForm(f=>({...f,retention_pct:e.target.value}))} />
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Retention Basis</label>
                              <select style={S.inp} value={ipoForm.retention_basis} onChange={e=>setIpoForm(f=>({...f,retention_basis:e.target.value}))}>
                                <option value="EX_VAT">Ex-VAT</option><option value="INCL_VAT">Incl. VAT</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label style={S.label}>Notes</label>
                            <textarea style={{ ...S.inp, minHeight:70, resize:'vertical' }}
                              value={ipoForm.notes} onChange={e=>setIpoForm(f=>({...f,notes:e.target.value}))}
                              placeholder="Additional terms or remarks…" />
                          </div>
                        </>
                      )}
                      {ipoStep===3&&(
                        <div style={{ ...S.section, borderColor:`${PRI}30` }}>
                          <LineItemsEditor items={ipoItems} onChange={setIpoItems} accentColor={PRI} billingMode={ipoForm.billing_mode} />
                        </div>
                      )}
                      </div>
                      <div style={{ padding:'14px 24px', borderTop:'1px solid #f0f4f8', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fafbfd', flexShrink:0 }}>
                        <button onClick={()=>ipoStep===1?setShowIpoForm(false):setIpoStep(s=>s-1)}
                          style={{ background:'#747474', color:'#fff', border:'none', borderRadius:22, padding:'9px 24px', fontWeight:700, cursor:'pointer', fontFamily:PP }}>
                          {ipoStep===1?'Cancel':'Back'}
                        </button>
                        {ipoStep<STEPS.length ? (
                          <button onClick={()=>setIpoStep(s=>s+1)}
                            style={{ ...S.btn(PRI), padding:'9px 26px' }}>
                            Next
                          </button>
                        ) : (
                          <button onClick={saveIpo} disabled={savingIpo}
                            style={{ ...S.btn(PRI), padding:'9px 26px' }}>
                            {savingIpo?'Saving…':editIpo?'Update PO':'Save Incoming PO'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
            </div>
        )
      })()}

      {showOpoForm&&(()=>{
        const PRI=OUT_PRI, BOX1=OUT_BOX1, BOX2=OUT_BOX2
        const STEPS=['Dept & Project','Supplier & Terms','Line Items & Notes']
        const STEP_DESC=['Department, project, site and brief description of the purchase.','Choose the supplier or sub-contractor and set payment terms.','Add line items with job type, quantity and unit price. Add notes below.']
        return (
          <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)setShowOpoForm(false)}}>
            <div style={{ background:'#70A5A6', borderRadius:18, padding:8, width:960, maxWidth:'calc(100vw - 24px)', boxShadow:'0 24px 80px rgba(0,0,0,0.35)' }}>
              
                <div style={{ background:'#EAF3F2', borderRadius:12, display:'flex', position:'relative', overflow:'hidden', minHeight:520 }}>
                    <div style={{ position:'absolute', top:0, right:0, width:220, height:185, background:'#0079BC', borderRadius:'0 12px 0 90px', zIndex:1 }} />
                    <div style={{ width:260, flexShrink:0, padding:'20px 20px 16px', display:'flex', flexDirection:'column', position:'relative', zIndex:2, fontFamily:PP }}>
                      <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.5, textTransform:'uppercase', marginBottom:4 }}>Ratal Advanced Technologies</div>
                      <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Operations</div>
                      <div style={{ fontSize:22, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6, fontFamily:PP }}>{STEPS[opoStep-1]}</div>
                      <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[opoStep-1]}</div>
                      <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1, marginBottom:14 }}>STEP {opoStep} OF {STEPS.length}</div>
                      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                        {STEPS.map((name,idx)=>{
                          const sn=idx+1, isAct=opoStep===sn, isDone=opoStep>sn
                          return (
                            <div key={sn} onClick={()=>isDone&&setOpoStep(sn)} style={{ display:'flex', alignItems:'center', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft:isAct?'3px solid #0079BC':isDone?'3px solid rgba(0,121,188,0.35)':'3px solid rgba(0,0,0,0.08)' }}>
                              <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#0a1322':isDone?'#4a6a8a':'#8aabba' }}>{name}</span>
                              {isDone&&<span style={{ marginLeft:6, fontSize:10, color:'#4a6a8a' }}>✓</span>}
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize:10, color:'#8aabba', marginTop:8, fontFamily:PP }}>Issue PO to Supplier / Sub-Contractor · AP</div>
                    </div>
                    <div style={{ flex:1, background:'#fff', borderRadius:10, margin:'56px 10px 10px 0', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:3 }}>
                      <div style={{ padding:'20px 24px 0', flexShrink:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <div style={{ fontSize:16, fontWeight:900, color:'#fff', marginBottom:10, fontFamily:PP }}>{STEPS[opoStep-1]}</div>
                          <button onClick={()=>setShowOpoForm(false)} style={{ background:'#f0f4f8', border:'none', color:'#8aabba', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                        </div>
                        <div style={{ height:1, background:'#e8edf5' }} />
                      </div>
                      <div style={{ flex:1, overflowY:'auto', padding:'16px 24px 14px', fontFamily:PP }}>
                      {opoStep===1&&(
                        <>
                          {/* Brief Description + OPO# — per PDF spec, top of Step 1 */}
                          <div style={S.row}>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Brief Description *</label>
                              <input style={S.inp} value={opoForm.brief_description} onChange={e=>setOpoForm(f=>({...f,brief_description:e.target.value}))}
                                placeholder="e.g. MW Link Installation — Project STC/SCP/2026-001" />
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Outgoing PO #</label>
                              <div style={{ ...S.inp, background:'#f8faff', color:'#6b7c93', fontSize:12, fontFamily:'monospace' }}>
                                {editOpo ? editOpo.po_number : `Auto — RAT-PO-${YEAR}-[CAT]-001`}
                              </div>
                            </div>
                          </div>
                          <div style={S.row}>
                            <div style={S.col}>
                              <label style={S.label}>PO Date *</label>
                              <input type="date" style={S.inp} value={opoForm.po_date} onChange={e=>setOpoForm(f=>({...f,po_date:e.target.value}))} />
                            </div>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Department *</label>
                              <select style={S.inp} value={opoForm.department_id} onChange={e=>onOpoDeptChange(e.target.value)}>
                                <option value="">— Select Department —</option>
                                {departments.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
                              </select>
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Dept Head</label>
                              <select style={{ ...S.inp, background:'#f8faff' }} value={opoForm.dept_head_id} onChange={e=>setOpoForm(f=>({...f,dept_head_id:e.target.value}))}>
                                <option value="">— Auto-filled —</option>
                                {allEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={S.row}>
                            <div style={S.col}>
                              <label style={S.label}>Requested By</label>
                              <select style={S.inp} value={opoForm.requested_by} onChange={e=>setOpoForm(f=>({...f,requested_by:e.target.value}))} disabled={!opoForm.department_id}>
                                <option value="">{opoForm.department_id?'— Select —':'— Select Dept First —'}</option>
                                {opoDeptEmps.map(e=><option key={e.id} value={e.id}>{e.full_name_en}</option>)}
                              </select>
                            </div>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Project (Optional)</label>
                              <select style={S.inp} value={opoForm.project_id} onChange={e=>onOpoProjectChange(e.target.value)} disabled={!opoForm.department_id}>
                                <option value="">{opoForm.department_id?'— Select —':'— Select Dept First —'}</option>
                                {opoProjects.map(p=><option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>)}
                              </select>
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Site (Optional)</label>
                              <select style={S.inp} value={opoForm.site_id} onChange={e=>setOpoForm(f=>({...f,site_id:e.target.value}))} disabled={!opoForm.project_id}>
                                <option value="">{opoForm.project_id?'— Select —':'— Select Project First —'}</option>
                                {opoSites.map(s=><option key={s.id} value={s.id}>{s.sm_id}{s.site_name?` — ${s.site_name}`:''}</option>)}
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                      {opoStep===2&&(
                        <>
                          <div style={S.row}>
                            <div style={S.col}>
                              <label style={S.label}>Category *</label>
                              <select style={S.inp} value={opoForm.category} onChange={e=>onOpoCategoryChange(e.target.value)}>
                                <option value="">— Select Category —</option>
                                {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Supplier / Vendor / Sub-Con *</label>
                              <select style={S.inp} value={opoForm.supplier_id} onChange={e=>onOpoSupplierChange(e.target.value)} disabled={!opoForm.category}>
                                <option value="">{opoForm.category?'— Select Supplier —':'— Select Category First —'}</option>
                                {(opoForm.category?filteredSuppliers:suppliers).map(s=>(
                                  <option key={s.id} value={s.id}>{s.contractor_name}{s.specialization?` · ${s.specialization}`:''}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div style={S.row}>
                            <div style={S.col}>
                              <label style={S.label}>Payment Terms</label>
                              <select style={S.inp} value={opoForm.payment_terms} onChange={e=>setOpoForm(f=>({...f,payment_terms:e.target.value}))}>
                                {PAYMENT_TERMS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>PO Number (auto)</label>
                              <div style={{ ...S.inp, background:'#f8faff', color:'#6b7c93', fontSize:12, fontFamily:'monospace' }}>
                                {editOpo?editOpo.po_number:`RAT-PO-${YEAR}-[CATEGORY CODE]-[SEQ]`}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                      {opoStep===3&&(
                        <>
                          <div style={{ ...S.section, borderColor:`${PRI}30` }}>
                            <LineItemsEditor items={opoItems} onChange={setOpoItems} accentColor={PRI} jobTypes={opoJobTypes} onAddJobType={addJobType} />
                          </div>
                          {!opoForm.category&&<div style={{ fontSize:12, color:'#f57f17', fontWeight:700, marginBottom:10, padding:'6px 10px', background:'#fff8e1', borderRadius:6 }}>⚠ Select a Category in Step 2 to load job types for line items</div>}
                          <div>
                            <label style={S.label}>Notes / Terms</label>
                            <textarea style={{ ...S.inp, minHeight:70, resize:'vertical' }}
                              value={opoForm.notes} onChange={e=>setOpoForm(f=>({...f,notes:e.target.value}))} placeholder="Terms, conditions, payment instructions…" />
                          </div>
                        </>
                      )}
                      </div>
                      <div style={{ padding:'14px 24px', borderTop:'1px solid #f0f4f8', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fafbfd', flexShrink:0 }}>
                        <button onClick={()=>opoStep===1?setShowOpoForm(false):setOpoStep(s=>s-1)}
                          style={{ background:'#747474', color:'#fff', border:'none', borderRadius:22, padding:'9px 24px', fontWeight:700, cursor:'pointer', fontFamily:PP }}>
                          {opoStep===1?'Cancel':'Back'}
                        </button>
                        {opoStep<STEPS.length ? (
                          <button onClick={()=>setOpoStep(s=>s+1)}
                            style={{ ...S.btn(PRI), padding:'9px 26px' }}>
                            Next
                          </button>
                        ) : (
                          <button onClick={saveOpo} disabled={savingOpo}
                            style={{ ...S.btn(PRI), padding:'9px 26px' }}>
                            {savingOpo?'Saving…':editOpo?'Update PO':'Submit Outgoing PO'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
            </div>
        )
      })()}

      {showCoForm&&(
        <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)setShowCoForm(false)}}>
          <div style={{ background:'#fff', borderRadius:16, width:600, maxWidth:'96vw', maxHeight:'94vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ background:'#0079BC', padding:'20px 24px', borderRadius:'16px 16px 0 0' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:24 }}>🔄</div>
                <div>
                  <div style={{ color:'#fff', fontWeight:900, fontSize:16, fontFamily:PP }}>New Change Order</div>
                  <div style={{ color:'rgba(255,255,255,0.6)', fontSize:11 }}>Against: {incomingPOs.find(p=>p.id===coParent)?.contractor_po_number}</div>
                </div>
                <button onClick={()=>setShowCoForm(false)} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:9, width:34, height:34, cursor:'pointer', fontSize:16, fontFamily:PP }}>x</button>
              </div>
            </div>
            <div style={{ padding:'22px 24px' }}>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>CO Date *</label>
                  <input type="date" style={S.inp} value={coForm.co_date} onChange={e=>setCoForm(f=>({...f,co_date:e.target.value}))} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Job Type</label>
                  <input style={S.inp} value={coForm.job_type} onChange={e=>setCoForm(f=>({...f,job_type:e.target.value}))} placeholder="e.g. Civil Works" />
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={S.label}>Scope of Change *</label>
                <textarea style={{ ...S.inp, minHeight:70 }} value={coForm.description}
                  onChange={e=>setCoForm(f=>({...f,description:e.target.value}))} placeholder="Describe what changed…" />
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Qty</label>
                  <input type="number" style={S.inp} value={coForm.qty} onChange={e=>setCoForm(f=>({...f,qty:e.target.value}))} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Unit Price (SAR)</label>
                  <input type="number" style={S.inp} value={coForm.unit_price} onChange={e=>setCoForm(f=>({...f,unit_price:e.target.value}))} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>CO Total Value (SAR) *</label>
                  <input type="number" style={{ ...S.inp, fontWeight:800, color:'#0079BC' }} value={coForm.co_value} onChange={e=>setCoForm(f=>({...f,co_value:e.target.value}))} />
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={S.label}>Notes</label>
                <input style={S.inp} value={coForm.notes} onChange={e=>setCoForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes…" />
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:12, borderTop:'1px solid #eef2f7' }}>
                <button onClick={()=>setShowCoForm(false)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:22, padding:'9px 20px', fontWeight:700, cursor:'pointer', fontFamily:PP }}>Cancel</button>
                <button onClick={saveCo} disabled={savingCo} style={{ ...S.btn('#0079BC'), padding:'9px 24px' }}>
                  {savingCo?'Saving…':'Save Change Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPdfImport&&(
        <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget){resetPdfImport();setShowPdfImport(false)}}}>
          <div style={{ background:'#fff', borderRadius:16, width:820, maxWidth:'96vw', maxHeight:'95vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ background:`linear-gradient(135deg,${INC_PRI},${INC_BOX1})`, padding:'20px 24px', borderRadius:'16px 16px 0 0', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
              <div style={{ fontSize:28 }}>📄</div>
              <div>
                <div style={{ color:'#fff', fontWeight:900, fontSize:16, fontFamily:PP }}>Import Incoming PO from PDF</div>
                <div style={{ color:'rgba(255,255,255,0.6)', fontSize:11 }}>OCR extraction · Review · Save to Incoming POs</div>
              </div>
              <button onClick={()=>{resetPdfImport();setShowPdfImport(false)}} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:9, width:34, height:34, cursor:'pointer', fontSize:16 }}>x</button>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'22px 24px' }}>
              {pdfStage==='upload'&&(
                <div
                  onDragOver={e=>{e.preventDefault();setPdfDragOver(true)}}
                  onDragLeave={()=>setPdfDragOver(false)}
                  onDrop={e=>{e.preventDefault();setPdfDragOver(false);const f=e.dataTransfer.files?.[0];if(f)handlePdfFile(f)}}
                  style={{ border:`2px dashed ${pdfDragOver?INC_PRI:'#cdd5e0'}`, borderRadius:14, padding:'48px 32px', textAlign:'center', background:pdfDragOver?`${INC_PRI}08`:'#fafbfd', cursor:'pointer', transition:'all 0.2s' }}
                  onClick={()=>{ const i=document.createElement('input'); i.type='file'; i.accept='.pdf'; i.onchange=e=>{ if(e.target.files?.[0]) handlePdfFile(e.target.files[0]) }; i.click() }}>
                  <div style={{ fontSize:48, marginBottom:14 }}>📤</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#1a2e3d', fontFamily:PP, marginBottom:6 }}>Drop PDF here or click to browse</div>
                  <div style={{ fontSize:12, color:'#6b7c93' }}>Incoming PO PDF from your contractor · Tesseract.js OCR (no cloud)</div>
                  {pdfError&&<div style={{ marginTop:14, fontSize:12, color:'#c62828', background:'#ffebee', padding:'8px 14px', borderRadius:8 }}>{pdfError}</div>}
                </div>
              )}

              {pdfStage==='reading'&&(
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#1a2e3d', fontFamily:PP, marginBottom:8 }}>Reading PDF…</div>
                  <div style={{ fontSize:12, color:'#6b7c93' }}>OCR extraction in progress (browser-side, no upload)</div>
                </div>
              )}

              {pdfStage==='saving'&&(
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>💾</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#1a2e3d', fontFamily:PP }}>Saving to Incoming POs…</div>
                </div>
              )}

              {pdfStage==='done'&&(
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:52, marginBottom:16 }}>✅</div>
                  <div style={{ fontSize:18, fontWeight:900, color:INC_PRI, fontFamily:PP, marginBottom:8 }}>PO Imported Successfully!</div>
                  <div style={{ fontSize:12, color:'#6b7c93', marginBottom:24 }}>{pdfContractorPoNum} has been added to Incoming POs</div>
                  <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                    <button onClick={resetPdfImport} style={{ ...S.btn(INC_PRI), padding:'10px 24px' }}>Import Another</button>
                    <button onClick={()=>{resetPdfImport();setShowPdfImport(false)}} style={{ padding:'10px 22px', borderRadius:9, border:'1.5px solid #dde3ec', background:'#fff', color:'#6b7c93', fontWeight:700, cursor:'pointer', fontFamily:PP }}>Done</button>
                  </div>
                </div>
              )}

              {pdfStage==='review'&&(
                <>
                  {pdfParsed&&(
                    <div style={{ background:`${INC_PRI}0e`, border:`1px solid ${INC_PRI}30`, borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, color:INC_PRI }}>
                      <strong>Parsed:</strong> {pdfParsed.contractor_name||'Unknown contractor'} · {pdfParsed.contractor_po_number||'—'} · Items: {(pdfParsed.line_items||[]).length}
                    </div>
                  )}
                  <div style={S.row}>
                    <div style={S.col}>
                      <label style={S.label}>Contractor *</label>
                      <select style={S.inp} value={pdfContractorId} onChange={e=>setPdfContractorId(e.target.value)}>
                        <option value="">— Select Contractor —</option>
                        {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_code?`[${c.contractor_code}] `:''}{c.contractor_name}</option>)}
                      </select>
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>Contractor PO Number *</label>
                      <input style={{ ...S.inp, fontFamily:'monospace', fontWeight:700, color:INC_PRI }}
                        value={pdfContractorPoNum} onChange={e=>setPdfContractorPoNum(e.target.value)} />
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>PO Date</label>
                      <input type="date" style={S.inp} value={pdfPoDate} onChange={e=>setPdfPoDate(e.target.value)} />
                    </div>
                  </div>
                  <div style={S.row}>
                    <div style={{ ...S.col, flex:2 }}>
                      <label style={S.label}>Department *</label>
                      <select style={S.inp} value={pdfDeptId} onChange={e=>setPdfDeptId(e.target.value)}>
                        <option value="">— Select Department —</option>
                        {departments.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
                      </select>
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>Currency</label>
                      <select style={S.inp} value={pdfCurrency} onChange={e=>setPdfCurrency(e.target.value)}>
                        {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {pdfCurrency!=='SAR'&&(
                      <div style={S.col}>
                        <label style={S.label}>FX Rate (1 {pdfCurrency} = SAR)</label>
                        <input type="number" step="0.0001" style={S.inp} value={pdfFxRate} onChange={e=>setPdfFxRate(e.target.value)} />
                      </div>
                    )}
                    <div style={S.col}>
                      <label style={S.label}>Credit Days</label>
                      <input type="number" style={S.inp} value={pdfPaymentDays} onChange={e=>setPdfPaymentDays(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={S.label}>Notes</label>
                    <textarea style={{ ...S.inp, minHeight:50, resize:'vertical' }} value={pdfNotes} onChange={e=>setPdfNotes(e.target.value)} />
                  </div>
                  <div style={{ ...S.section, borderColor:`${INC_PRI}30` }}>
                    <LineItemsEditor items={pdfLineItems} onChange={setPdfLineItems} accentColor={INC_PRI} />
                  </div>
                  {pdfSaveError&&<div style={{ fontSize:12, color:'#c62828', background:'#ffebee', padding:'8px 12px', borderRadius:8, marginTop:8 }}>{pdfSaveError}</div>}
                </>
              )}
            </div>

            {pdfStage==='review'&&(
              <div style={{ padding:'14px 24px', borderTop:'1px solid #f0f4f8', display:'flex', justifyContent:'space-between', flexShrink:0 }}>
                <button onClick={resetPdfImport} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:22, padding:'9px 20px', fontWeight:700, cursor:'pointer', fontFamily:PP }}>
                  Re-upload
                </button>
                <button onClick={savePdfImport}
                  style={{ ...S.btn(INC_PRI), padding:'9px 26px' }}>
                  Save Incoming PO
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
