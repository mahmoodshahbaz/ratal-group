import { GROUP_COLORS } from '../styles/appStyles'
/**
 * IncomingPOImport.jsx
 * ─────────────────────────────────────────────────────────────────
 * Import a client Purchase Order from a PDF file.
 *
 * STAGES:
 *  1. UPLOAD  — Drop zone / file picker
 *  2. READING — PDF.js extracts text + parser runs (spinner)
 *  3. REVIEW  — Pre-filled editable form → Confirm & Save
 *  4. DONE    — Success confirmation with "Import Another" button
 */

import { useState, useEffect, useRef } from 'react'
import { supabase }           from '../lib/supabase'
import { extractPdfText }     from '../lib/pdfExtract'
import { parsePO }            from '../lib/poParser'
import { useDriveUpload }     from '../hooks/useDriveUpload'

// ─── Styles ──────────────────────────────────────────────────────
const MC = GROUP_COLORS.Operations

const S = {
  page:    { maxWidth: 860, margin: '0 auto', padding: '0 4px' },
  card:    { background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', padding: '24px 28px', marginBottom: 20 },
  label:   { fontSize: 11, fontWeight: 700, color: '#6b7c93', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' },
  inp:     { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d0d7e2', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fafbfc' },
  inpFill: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #90caf9', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#e3f2fd' },
  row:     { display: 'grid', gap: 14, marginBottom: 14 },
  btn:     { padding: '10px 24px', borderRadius: 9, border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
  th:      { padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#fff', fontWeight: 700, background: MC },
  td:      { padding: '7px 10px', fontSize: 12, borderTop: '1px solid #f0f4f8' },
}

// ─── Confidence badge ─────────────────────────────────────────────
const CONF_COLOR = { HIGH: '#2e7d32', MEDIUM: '#e65100', LOW: '#c62828' }
function ConfBadge({ level }) {
  const c = CONF_COLOR[level] || '#607d8b'
  return (
    <span style={{ background: c + '22', color: c, borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>
      {level === 'HIGH' ? '✅' : level === 'MEDIUM' ? '⚠️' : '❗'} {level} CONFIDENCE
    </span>
  )
}

// ─── Empty line item ──────────────────────────────────────────────
const emptyLine = () => ({ id: crypto.randomUUID(), description: '', qty: '1', unit_price: '', job_type: '' })

// ─── Main component ───────────────────────────────────────────────
export default function IncomingPOImport({ entityId }) {
  // ── Master data ──────────────────────────────────────────────
  const [contractors,  setContractors]  = useState([])
  const [departments,  setDepartments]  = useState([])
  const [projects,     setProjects]     = useState([])

  // ── Stage machine ────────────────────────────────────────────
  // 'upload' | 'reading' | 'review' | 'saving' | 'done'
  const [stage, setStage] = useState('upload')

  // ── Upload state ─────────────────────────────────────────────
  const [dragOver,  setDragOver]  = useState(false)
  const [pdfFile,   setPdfFile]   = useState(null)
  const [readError, setReadError] = useState('')
  const fileRef = useRef()

  // ── Parsed result ────────────────────────────────────────────
  const [parsed,    setParsed]    = useState(null)
  const [rawText,   setRawText]   = useState('')

  // ── Review form fields ───────────────────────────────────────
  const [contractorId,      setContractorId]      = useState('')
  const [contractorPoNum,   setContractorPoNum]   = useState('')
  const [poDate,            setPoDate]            = useState('')
  const [totalValue,        setTotalValue]        = useState('')
  const [currency,          setCurrency]          = useState('SAR')
  const [fxRate,            setFxRate]            = useState('1')
  const [departmentId,      setDepartmentId]      = useState('')
  const [projectId,         setProjectId]         = useState('')
  const [paymentTermsDays,  setPaymentTermsDays]  = useState('30')
  const [notes,             setNotes]             = useState('')
  const [lineItems,         setLineItems]         = useState([emptyLine()])

  // ── Done state ───────────────────────────────────────────────
  const [savedPoId,      setSavedPoId]      = useState(null)
  const [saveError,      setSaveError]      = useState('')
  const [attachmentUrl,  setAttachmentUrl]  = useState('')
  const { upload: driveUpload, uploading: driveUploading } = useDriveUpload()

  // ── Load master data ─────────────────────────────────────────
  useEffect(() => {
    if (!entityId) return
    Promise.all([
      supabase.from('contractors').select('id,contractor_name,contractor_code').eq('entity_id', entityId).eq('vendor_type', 'CONTRACTOR').order('contractor_name'),
      // Note: omit is_active filter — column may not exist in all deployments
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id', entityId).order('dept_name'),
    ]).then(([{ data: c, error: ce }, { data: d, error: de }]) => {
      setContractors(c || [])
      setDepartments(d || [])
      if (ce) console.warn('Contractors load error:', ce.message)
      if (de) console.warn('Departments load error:', de.message)
    })
  }, [entityId])

  // ── Load projects when department changes ────────────────────
  useEffect(() => {
    if (!departmentId || !entityId) { setProjects([]); return }
    supabase.from('projects').select('id,project_number,project_name')
      .eq('entity_id', entityId).order('project_number')
      .then(({ data }) => setProjects(data || []))
  }, [departmentId, entityId])

  // ─────────────────────────────────────────────────────────────
  // STAGE 1: File handling
  // ─────────────────────────────────────────────────────────────
  function handleFile(file) {
    if (!file) return
    if (file.type !== 'application/pdf') { setReadError('Please select a PDF file.'); return }
    setReadError('')
    setPdfFile(file)
    processFile(file)
  }

  async function processFile(file) {
    setStage('reading')
    try {
      const { fullText } = await extractPdfText(file)
      setRawText(fullText)
      const result = parsePO(fullText)
      setParsed(result)

      // Pre-fill the review form
      setContractorPoNum(result.poNumber   || '')
      setPoDate(         result.poDate     || '')
      setTotalValue(     result.totalValue > 0 ? String(result.totalValue) : '')
      setCurrency(       result.currency   || 'SAR')
      setFxRate(         result.currency !== 'SAR' ? '3.75' : '1')
      setNotes(          result.issuerName ? `Issuer: ${result.issuerName}` : '')
      // Filter out obvious garbage rows (all-numeric descriptions, page footers, qty=1000 oddities)
      const cleanItems = (result.lineItems || []).filter(l => {
        const d = (l.description || '').trim()
        if (!d || d.length < 4)          return false  // empty
        if (/^[\d\s,\.]+$/.test(d))      return false  // pure numbers e.g. "1.000"
        if (/^purchase order/i.test(d))  return false  // page footer
        if (l.unitPrice > 500_000_000)   return false  // implausibly huge
        return true
      })
      setLineItems(
        cleanItems.length > 0
          ? cleanItems.map(l => ({ id: crypto.randomUUID(), description: l.description, qty: String(l.quantity), unit_price: String(l.unitPrice), job_type: '', is_header: l.is_header || false }))
          : [emptyLine()]
      )

      // Try to auto-match contractor by issuer name / VAT
      if (result.vatNumber || result.issuerName) {
        const { data: match } = await supabase
          .from('contractors')
          .select('id')
          .eq('entity_id', entityId)
          .or(
            result.vatNumber
              ? `vat_number.eq.${result.vatNumber}`
              : `contractor_name.ilike.%${(result.issuerName||'').slice(0,20).trim()}%`
          )
          .limit(1)
          .single()
        if (match?.id) setContractorId(match.id)
      }

      setStage('review')
    } catch (err) {
      setReadError('Could not read this PDF: ' + (err.message || 'Unknown error'))
      setStage('upload')
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STAGE 2: Line items helpers
  // ─────────────────────────────────────────────────────────────
  function updateLine(id, field, val) {
    setLineItems(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l))
  }
  function addLine()        { setLineItems(prev => [...prev, emptyLine()]) }
  function removeLine(id)   { setLineItems(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev) }

  const computedSubtotal = lineItems.reduce((s, l) => l.is_header ? s : s + (parseFloat(l.qty)||0) * (parseFloat(l.unit_price)||0), 0)

  // ─────────────────────────────────────────────────────────────
  // STAGE 3: Save
  // ─────────────────────────────────────────────────────────────
  async function handleConfirm() {
    setSaveError('')
    if (!contractorId)    { setSaveError('Contractor is required.'); return }
    if (!departmentId)    { setSaveError('Department is required.'); return }
    if (!projectId)       { setSaveError('Project is required.'); return }
    if (!contractorPoNum) { setSaveError('PO Number is required.'); return }
    if (!poDate)          { setSaveError('PO Date is required.'); return }
    if (lineItems.some(l => !l.description)) { setSaveError('All line items must have a description.'); return }

    setStage('saving')

    // ── Duplicate check ──────────────────────────────────────
    const { data: dup } = await supabase
      .from('incoming_pos')
      .select('id')
      .eq('entity_id', entityId)
      .eq('contractor_id', contractorId)
      .eq('contractor_po_number', contractorPoNum)
      .limit(1)
      .maybeSingle()
    if (dup) {
      setSaveError(`Duplicate PO: "${contractorPoNum}" from this contractor already exists. If this is a revision or new release, update the PO number to include the revision suffix before saving.`)
      setStage('review')
      return
    }

    const subtotal    = computedSubtotal
    const totalVal    = parseFloat(totalValue) || subtotal

    // 1. Insert incoming_pos
    const { data: po, error: poErr } = await supabase
      .from('incoming_pos')
      .insert({
        entity_id:            entityId,
        contractor_id:        contractorId,
        contractor_po_number: contractorPoNum,
        po_date:              poDate,
        department_id:        departmentId || null,
        project_id:           projectId || null,
        payment_terms:        'CREDIT',
        payment_terms_days:   parseInt(paymentTermsDays) || 30,
        notes:                notes || null,
        original_currency:    currency,
        fx_rate:              parseFloat(fxRate) || 1,
        subtotal,
        total_value:          totalVal,
        retention_pct:        0,
        billing_mode:         'QTY',
        status:               'ACTIVE',
      })
      .select('id')
      .single()

    if (poErr) { setSaveError('Save failed: ' + poErr.message); setStage('review'); return }

    // 2. Insert line items
    const itemRows = lineItems.map((l, i) => ({
      incoming_po_id: po.id,
      sort_order:     i,
      description:    l.description,
      qty:            l.is_header ? 0 : (parseFloat(l.qty) || 1),
      unit_price:     l.is_header ? 0 : (parseFloat(l.unit_price) || 0),
      job_type:       l.job_type || null,
      is_header:      l.is_header || false,
    }))

    const { error: itemErr } = await supabase.from('incoming_po_items').insert(itemRows)
    if (itemErr) { setSaveError('PO saved but line items failed: ' + itemErr.message); setStage('review'); return }

    // 3. Upload PDF to Google Drive
    if (pdfFile) {
      const prefix = `IPO_${contractorPoNum.replace(/[^a-zA-Z0-9]/g, '_')}`
      const driveResult = await driveUpload(pdfFile, 'invoices', prefix)
      if (driveResult?.viewUrl) {
        setAttachmentUrl(driveResult.viewUrl)
        // Update the PO record with the Drive URL
        await supabase.from('incoming_pos').update({
          attachment_url:  driveResult.viewUrl,
          attachment_name: pdfFile.name,
        }).eq('id', po.id)
      }
    }

    setSavedPoId(po.id)
    setStage('done')
  }

  // ─────────────────────────────────────────────────────────────
  // Reset for "Import Another"
  // ─────────────────────────────────────────────────────────────
  function reset() {
    setStage('upload'); setPdfFile(null); setParsed(null); setRawText('')
    setContractorId(''); setContractorPoNum(''); setPoDate(''); setTotalValue('')
    setCurrency('SAR'); setFxRate('1'); setDepartmentId(''); setPaymentTermsDays('30')
    setNotes(''); setLineItems([emptyLine()]); setSavedPoId(null); setSaveError(''); setReadError('')
    setProjectId(''); setProjects([]); setAttachmentUrl('')
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#1a2e3d' }}>📥 Import Client PO from PDF</div>
        <div style={{ fontSize: 13, color: '#6b7c93', marginTop: 4 }}>
          Upload a client Purchase Order PDF — we'll extract the data and create the record for you.
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          STAGE: UPLOAD
      ══════════════════════════════════════════════════════════ */}
      {stage === 'upload' && (
        <div style={S.card}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1565c0' : '#b0bec5'}`,
              borderRadius: 14, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? '#e3f2fd' : '#f8fafd', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1a2e3d', marginBottom: 6 }}>
              Drop the client PO PDF here
            </div>
            <div style={{ fontSize: 13, color: '#6b7c93' }}>or click to browse files</div>
            <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          {readError && (
            <div style={{ marginTop: 14, background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 14px', color: '#c62828', fontSize: 13 }}>
              ❌ {readError}
            </div>
          )}

          {/* What we extract */}
          <div style={{ marginTop: 20, padding: '14px 18px', background: '#f0f4f8', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#1a2e3d', marginBottom: 8 }}>What we extract automatically:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12, color: '#546e7a' }}>
              {['PO Number', 'PO Date', 'Total Value', 'Currency', 'VAT Number', 'Issuer Name', 'Line Items', 'Quantities & Prices'].map(f => (
                <div key={f}>✓ {f}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STAGE: READING (spinner)
      ══════════════════════════════════════════════════════════ */}
      {stage === 'reading' && (
        <div style={{ ...S.card, textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#1565c0', marginBottom: 8 }}>Reading PDF…</div>
          <div style={{ fontSize: 13, color: '#6b7c93' }}>Extracting text and parsing fields. This takes a few seconds.</div>
          <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%', background: '#1565c0',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
          <style>{`@keyframes pulse { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }`}</style>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STAGE: REVIEW
      ══════════════════════════════════════════════════════════ */}
      {(stage === 'review' || stage === 'saving') && parsed && (
        <>
          {/* Confidence + source file */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#546e7a' }}>
              📄 <strong>{pdfFile?.name}</strong>
              {' · '}{parsed.pageCount} page{parsed.pageCount !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ConfBadge level={parsed.confidence} />
              {parsed.confidence !== 'HIGH' && (
                <span style={{ fontSize: 11, color: '#e65100' }}>Review highlighted fields carefully</span>
              )}
            </div>
          </div>

          {/* ── Section 1: PO Identification ── */}
          <div style={S.card}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#0277bd', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 4, height: 16, background: '#0277bd', borderRadius: 2, display: 'inline-block' }}></span>
              PO Identification
            </div>

            <div style={{ ...S.row, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={S.label}>Client PO Number <span style={{ color: '#c62828' }}>*</span></label>
                <input
                  style={contractorPoNum ? S.inpFill : S.inp}
                  value={contractorPoNum}
                  onChange={e => setContractorPoNum(e.target.value)}
                  placeholder="e.g. 4500123456"
                />
              </div>
              <div>
                <label style={S.label}>PO Date <span style={{ color: '#c62828' }}>*</span></label>
                <input
                  type="date"
                  style={poDate ? S.inpFill : S.inp}
                  value={poDate}
                  onChange={e => setPoDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ ...S.row, gridTemplateColumns: '2fr 1fr 1fr' }}>
              <div>
                <label style={S.label}>Contractor <span style={{ color: '#c62828' }}>*</span></label>
                <select
                  style={contractorId ? S.inpFill : S.inp}
                  value={contractorId}
                  onChange={e => setContractorId(e.target.value)}
                >
                  <option value="">— Select from Contractors list —</option>
                  {contractors.map(c => (
                    <option key={c.id} value={c.id}>{c.contractor_code ? `[${c.contractor_code}] ` : ''}{c.contractor_name}</option>
                  ))}
                </select>
                {parsed.issuerName && (
                  <div style={{ fontSize: 11, color: '#0277bd', marginTop: 4 }}>
                    💡 PDF issuer: <strong>{parsed.issuerName}</strong>
                    {contractors.length === 0 && (
                      <span style={{ color: '#e65100', marginLeft: 6 }}>— No contractors loaded. Check entity setup.</span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label style={S.label}>Currency</label>
                <select style={S.inpFill} value={currency} onChange={e => { setCurrency(e.target.value); setFxRate(e.target.value === 'SAR' ? '1' : '3.75') }}>
                  <option value="SAR">SAR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label style={S.label}>FX Rate (to SAR)</label>
                <input
                  style={S.inp}
                  value={fxRate}
                  onChange={e => setFxRate(e.target.value)}
                  disabled={currency === 'SAR'}
                  placeholder="e.g. 3.75"
                />
              </div>
            </div>

            <div style={{ ...S.row, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={S.label}>Department <span style={{ color: '#c62828' }}>*</span></label>
                <select
                  style={departmentId ? S.inpFill : S.inp}
                  value={departmentId}
                  onChange={e => { setDepartmentId(e.target.value); setProjectId('') }}
                >
                  <option value="">— Select Department —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Project <span style={{ color: '#c62828' }}>*</span></label>
                <select
                  style={projectId ? S.inpFill : S.inp}
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  disabled={!departmentId}
                >
                  <option value="">{departmentId ? '— Select Project —' : '— Select Department First —'}</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ ...S.row, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={S.label}>Payment Terms (days)</label>
                <input style={S.inp} type="number" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={S.label}>Notes</label>
              <textarea style={{ ...S.inp, minHeight: 60, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* ── Section 2: Line Items ── */}
          <div style={S.card}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#0277bd', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 4, height: 16, background: '#0277bd', borderRadius: 2, display: 'inline-block' }}></span>
              Line Items
              <span style={{ fontSize: 11, color: '#aab2bd', fontWeight: 400, marginLeft: 4 }}>
                {lineItems.length} row{lineItems.length !== 1 ? 's' : ''}
                {parsed.lineItems.length > 0 ? ' · extracted from PDF' : ' · enter manually'}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map(l => {
                    if (l.is_header) {
                      return (
                        <tr key={l.id} style={{ background: '#1e3a5f' }}>
                          <td colSpan={4} style={{ padding: '7px 14px', fontWeight: 800, fontSize: 12, color: '#e3f2fd', letterSpacing: 0.5 }}>
                            ▸ {l.description}
                          </td>
                          <td style={{ ...S.td, background: '#1e3a5f', textAlign: 'center' }}>
                            <button onClick={() => removeLine(l.id)} style={{ background: 'none', border: 'none', color: '#90caf9', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>✕</button>
                          </td>
                        </tr>
                      )
                    }
                    const total = (parseFloat(l.qty)||0) * (parseFloat(l.unit_price)||0)
                    return (
                      <tr key={l.id}>
                        <td style={S.td}>
                          <input style={{ ...S.inp, minWidth: 200 }} value={l.description} onChange={e => updateLine(l.id, 'description', e.target.value)} placeholder="Description of supply / service" />
                        </td>
                        <td style={{ ...S.td, width: 70 }}>
                          <input style={{ ...S.inp, textAlign: 'right' }} type="number" value={l.qty} onChange={e => updateLine(l.id, 'qty', e.target.value)} />
                        </td>
                        <td style={{ ...S.td, width: 130 }}>
                          <input style={{ ...S.inp, textAlign: 'right' }} type="number" value={l.unit_price} onChange={e => updateLine(l.id, 'unit_price', e.target.value)} placeholder="0.00" />
                        </td>
                        <td style={{ ...S.td, width: 130, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                          {currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ ...S.td, width: 36, textAlign: 'center' }}>
                          <button onClick={() => removeLine(l.id)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>Subtotal</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, fontSize: 14, fontFamily: 'monospace', color: '#1565c0' }}>
                      {currency} {computedSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={S.td}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addLine} style={{ ...S.btn, background: '#e3f2fd', color: '#1565c0', padding: '6px 16px', fontSize: 12 }}>
                  + Add Row
                </button>
                <button onClick={() => setLineItems([emptyLine()])} style={{ ...S.btn, background: '#fce4ec', color: '#c62828', padding: '6px 16px', fontSize: 12 }}>
                  ✕ Clear Items
                </button>
              </div>
              <div>
                <label style={{ ...S.label, display: 'inline', marginRight: 8 }}>Override Total Value:</label>
                <input
                  style={{ ...S.inp, display: 'inline-block', width: 160, textAlign: 'right' }}
                  type="number"
                  value={totalValue}
                  onChange={e => setTotalValue(e.target.value)}
                  placeholder={computedSubtotal.toFixed(2)}
                />
                <span style={{ fontSize: 11, color: '#aab2bd', marginLeft: 6 }}>Leave blank to use subtotal</span>
              </div>
            </div>
          </div>

          {/* ── Raw text toggle ── */}
          <details style={{ marginBottom: 20 }}>
            <summary style={{ fontSize: 12, color: '#607d8b', cursor: 'pointer', userSelect: 'none', fontWeight: 700 }}>
              🔍 View raw extracted text (share with support if items are wrong)
            </summary>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => { navigator.clipboard.writeText(rawText); alert('Raw text copied to clipboard!') }}
                style={{ ...S.btn, background: '#607d8b', color: '#fff', padding: '4px 14px', fontSize: 11, marginBottom: 8 }}
              >📋 Copy All to Clipboard</button>
              <pre style={{ fontSize: 10, background: '#f8f9fa', borderRadius: 8, padding: 12, overflowX: 'auto', maxHeight: 400, color: '#546e7a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {rawText}
              </pre>
            </div>
          </details>

          {/* ── Error ── */}
          {saveError && (
            <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 14px', color: '#c62828', fontSize: 13, marginBottom: 14 }}>
              ❌ {saveError}
            </div>
          )}

          {/* ── Action buttons ── */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={reset} style={{ ...S.btn, background: '#f0f4f8', color: '#546e7a' }}>
              ← Start Over
            </button>
            <button
              onClick={handleConfirm}
              disabled={stage === 'saving'}
              style={{ ...S.btn, background: stage === 'saving' ? '#90caf9' : 'linear-gradient(135deg,#1565c0,#1976d2)', color: '#fff', minWidth: 160 }}
            >
              {stage === 'saving' && driveUploading ? '☁️ Uploading to Drive…' : stage === 'saving' ? '⏳ Saving…' : '✅ Confirm & Save PO'}
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          STAGE: DONE
      ══════════════════════════════════════════════════════════ */}
      {stage === 'done' && (
        <div style={{ ...S.card, textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontWeight: 900, fontSize: 20, color: '#2e7d32', marginBottom: 8 }}>
            PO Imported Successfully!
          </div>
          <div style={{ fontSize: 13, color: '#6b7c93', marginBottom: 6 }}>
            <strong>{contractorPoNum}</strong> has been saved as an Incoming PO.
          </div>
          <div style={{ fontSize: 12, color: '#aab2bd', marginBottom: 12, fontFamily: 'monospace' }}>
            Record ID: {savedPoId}
          </div>
          {attachmentUrl
            ? <div style={{ fontSize: 13, color: '#2e7d32', marginBottom: 20 }}>
                📎 PDF saved to Google Drive —{' '}
                <a href={attachmentUrl} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>View Document</a>
              </div>
            : <div style={{ fontSize: 12, color: '#aab2bd', marginBottom: 20 }}>
                ⚠️ PDF not uploaded to Drive (check Drive connection)
              </div>
          }
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={reset} style={{ ...S.btn, background: 'linear-gradient(135deg,#1565c0,#1976d2)', color: '#fff' }}>
              📥 Import Another PO
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'purchase_orders' }))}
              style={{ ...S.btn, background: '#e8f5e9', color: '#2e7d32' }}
            >
              📋 View All POs
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
