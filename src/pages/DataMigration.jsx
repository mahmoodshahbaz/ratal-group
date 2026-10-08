import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Data Migration & Daily CSV Import
// Core feature: smart duplicate/change detection for GWT and RAT
// Every CSV row is classified as: NEW | CHANGED | DUPLICATE
// CHANGED rows show a field-by-field diff so user can review
// ═══════════════════════════════════════════════════════════════════

const S = {
  card:    { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  btn:     (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:     { padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  lbl:     { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:16, padding:24, width:680, maxWidth:'96vw', maxHeight:'88vh', overflow:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.2)' },
}

const ROW_STATUS = {
  NEW:       { label:'🆕 New',       color:'#2e7d32', bg:'#e8f5e9' },
  CHANGED:   { label:'⚠️ Changed',   color:'#e65100', bg:'#fff3e0' },
  DUPLICATE: { label:'🔁 Duplicate', color:'#546e7a', bg:'#f0f4f8' },
  ERROR:     { label:'❌ Error',      color:'#c62828', bg:'#ffebee' },
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  if (!text?.trim()) return { headers:[], rows:[], delimiter:',' }

  // Auto-detect delimiter from first line
  const firstLine = text.split('\n')[0]
  const counts = [',', '|', '\t', ';'].map(d => ({
    d,
    n: (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length,
  }))
  const delimiter = counts.sort((a, b) => b.n - a.n)[0].d

  function parseLine(line) {
    const cells = []
    let inQuotes = false, cell = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && (i === 0 || line[i-1] === delimiter || inQuotes)) {
        inQuotes = !inQuotes
      } else if (ch === delimiter && !inQuotes) {
        cells.push(cell.trim()); cell = ''
      } else {
        cell += ch
      }
    }
    cells.push(cell.trim())
    return cells
  }

  const lines = text.trim().split('\n').map(l => l.trimEnd()).filter(Boolean)
  if (lines.length < 2) return { headers:[], rows:[], delimiter }

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim() })
    return obj
  }).filter(r => Object.values(r).some(v => v !== ''))

  return { headers, rows, delimiter }
}

// ─── Smart column auto-mapper ─────────────────────────────────────────────────
const FIELD_ALIASES = {
  booking_ref:   ['booking_ref','booking ref','ref','reference','booking id','booking no','res no','reservation no','pnr','gds ref','file no','file ref','booking number','record locator'],
  client_name:   ['client','client name','customer','account','company','client_name','account name','payer'],
  traveler_name: ['traveler','traveller','passenger','pax name','name','guest','passenger name','lead pax'],
  service_type:  ['service','service type','product','type','segment','product type','travel type'],
  destination:   ['destination','route','sector','from-to','origin','city','to','des','dest','sector route'],
  travel_date:   ['travel date','departure','dep date','date','flight date','check in','checkin','dep','departure date','travel_date','date of travel'],
  return_date:   ['return date','return','arrival','arr date','check out','checkout','arr','arrival date','return_date'],
  pax_count:     ['pax','passengers','count','qty','quantity','no of pax','pax count','no pax'],
  ticket_no:     ['ticket','ticket no','ticket number','voucher','voucher no','confirmation','eticket','e-ticket','ticket_no'],
  supplier:      ['supplier','vendor','airline','hotel','operator','provider','carrier','airline code'],
  cost_amount:   ['cost','net','buy','purchase','net amount','cost amount','buying','net fare','cost_amount','buy price','nett'],
  sale_amount:   ['sale','sell','gross','selling','gross amount','sale amount','fare','total','selling price','sale_amount','gross fare'],
  status:        ['status','booking status','state','ticket status'],
  remarks:       ['remarks','notes','comments','note','remark','memo'],
}

function autoMapColumns(headers) {
  const mapping = {} // field → CSV header
  headers.forEach(h => {
    const hn = h.toLowerCase().replace(/[_\-]/g, ' ').trim()
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (mapping[field]) continue // already mapped
      if (aliases.some(a => hn === a || hn.includes(a) || a.includes(hn))) {
        mapping[field] = h
      }
    }
  })
  return mapping
}

// ─── Apply column mapping to a raw CSV row → trip_record shape ───────────────
function applyMapping(rawRow, mapping) {
  const out = {}
  for (const [field, csvHeader] of Object.entries(mapping)) {
    if (csvHeader && rawRow[csvHeader] !== undefined) {
      out[field] = rawRow[csvHeader]
    }
  }
  return out
}

// ─── Compare a DB record vs incoming CSV row — returns changed fields ─────────
function detectChanges(existing, incoming) {
  const COMPARE = ['client_name','traveler_name','service_type','destination',
    'travel_date','return_date','pax_count','ticket_no','supplier',
    'cost_amount','sale_amount','status','remarks']
  const changes = []
  for (const field of COMPARE) {
    if (incoming[field] === undefined || incoming[field] === '') continue
    const oldVal = String(existing[field] || '').trim()
    const newVal = String(incoming[field]  || '').trim()
    const isAmount = ['cost_amount','sale_amount'].includes(field)
    if (isAmount) {
      if (Math.abs((+oldVal || 0) - (+newVal || 0)) > 0.009) {
        changes.push({ field, old: oldVal, new: newVal, major: true })
      }
    } else if (['travel_date','return_date'].includes(field)) {
      if (oldVal.slice(0,10) !== newVal.slice(0,10) && newVal !== '') {
        changes.push({ field, old: oldVal, new: newVal, major: true })
      }
    } else if (oldVal !== newVal) {
      const severity = ['client_name','ticket_no'].includes(field)
      changes.push({ field, old: oldVal, new: newVal, major: severity })
    }
  }
  return changes
}

// ─── Diff Modal ───────────────────────────────────────────────────────────────
function DiffModal({ row, onClose, onSkip, onAccept }) {
  if (!row) return null
  const changes   = row._changes || []
  const unchanged = Object.keys(FIELD_ALIASES).filter(f =>
    row[f] !== undefined && !changes.find(c => c.field === f)
  )
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ fontWeight:800, fontSize:16, color:'#e65100', marginBottom:4 }}>
          ⚠️ Changed Record
        </div>
        <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
          Booking Ref: <strong>{row.booking_ref}</strong> · {changes.length} field{changes.length !== 1 ? 's' : ''} changed
        </div>

        <div style={{ fontSize:11, fontWeight:800, color:'#e65100', marginBottom:6, letterSpacing:0.5 }}>
          CHANGED FIELDS
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16, fontSize:12 }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              <th style={{ padding:'6px 10px', textAlign:'left', fontSize:10, color:'#546e7a', width:140 }}>FIELD</th>
              <th style={{ padding:'6px 10px', textAlign:'left', fontSize:10, color:'#c62828' }}>DATABASE</th>
              <th style={{ padding:'6px 10px', textAlign:'left', fontSize:10, color:'#2e7d32' }}>CSV (NEW)</th>
            </tr>
          </thead>
          <tbody>
            {changes.map(c => (
              <tr key={c.field} style={{ borderBottom:'1px solid #f5f5f5', background:'#fff8e1' }}>
                <td style={{ padding:'6px 10px', fontFamily:'monospace', fontSize:11, color:'#78909c', fontWeight:700 }}>{c.field}</td>
                <td style={{ padding:'6px 10px', color:'#c62828', textDecoration:'line-through', maxWidth:200, wordBreak:'break-all' }}>{c.old || '—'}</td>
                <td style={{ padding:'6px 10px', color:'#2e7d32', fontWeight:700, maxWidth:200, wordBreak:'break-all' }}>{c.new || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {unchanged.length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:800, color:'#aab2bd', marginBottom:6 }}>UNCHANGED FIELDS</div>
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16, fontSize:11 }}>
              <tbody>
                {unchanged.map(f => (
                  <tr key={f} style={{ borderBottom:'1px solid #f9f9f9' }}>
                    <td style={{ padding:'4px 10px', fontFamily:'monospace', color:'#aab2bd', width:140 }}>{f}</td>
                    <td style={{ padding:'4px 10px', color:'#546e7a' }}>{row[f] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button style={S.btn('#aab2bd')} onClick={onClose}>Close</button>
          {onSkip   && <button style={S.btn('#546e7a')} onClick={onSkip}>Skip this row</button>}
          {onAccept && <button style={S.btn('#e65100')} onClick={onAccept}>✓ Accept changes</button>}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Daily Booking Import Tab (core feature for GWT / RAT)
// ═══════════════════════════════════════════════════════════════════
function BookingImport({ entities, userId }) {
  const [entityId,    setEntityId]    = useState('')
  const [importDate,  setImportDate]  = useState(new Date().toISOString().slice(0,10))
  const [fileName,    setFileName]    = useState('')
  const [headers,     setHeaders]     = useState([])
  const [rawRows,     setRawRows]     = useState([])
  const [mapping,     setMapping]     = useState({})
  const [preview,     setPreview]     = useState([])   // annotated rows
  const [step,        setStep]        = useState(1)    // 1=upload 2=map 3=preview 4=done
  const [loading,     setLoading]     = useState(false)
  const [importing,   setImporting]   = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [result,      setResult]      = useState(null)
  const [diffRow,     setDiffRow]     = useState(null)
  const [skipSet,     setSkipSet]     = useState(new Set()) // indices to skip
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const { headers: h, rows } = parseCSV(ev.target.result)
      if (!h.length) { alert('Could not parse CSV — check the file format'); return }
      setHeaders(h)
      setRawRows(rows)
      setMapping(autoMapColumns(h))
      setStep(2)
    }
    reader.readAsText(file, 'utf-8')
  }

  function requiredMapped() {
    return !!mapping.booking_ref
  }

  async function runPreview() {
    if (!entityId) { alert('Select an entity first'); return }
    if (!requiredMapped()) { alert('"Booking Ref" column must be mapped'); return }
    setLoading(true)

    // Normalize all rows
    const normalized = rawRows.map(r => ({
      ...applyMapping(r, mapping),
      raw_data: r,
    }))

    // Batch-fetch existing records by booking_ref
    const refs = [...new Set(normalized.map(r => r.booking_ref).filter(Boolean))]
    const { data: existing } = await supabase
      .from('trip_records')
      .select('booking_ref, client_name, traveler_name, service_type, destination, travel_date, return_date, pax_count, ticket_no, supplier, cost_amount, sale_amount, status, remarks')
      .eq('entity_id', entityId)
      .in('booking_ref', refs)

    const existingMap = {}
    ;(existing || []).forEach(r => { existingMap[r.booking_ref] = r })

    // Classify each row
    const annotated = normalized.map((row, idx) => {
      const ref = row.booking_ref
      if (!ref) return { ...row, _idx: idx, _status: 'ERROR', _error: 'Missing booking_ref' }
      const db = existingMap[ref]
      if (!db) return { ...row, _idx: idx, _status: 'NEW', _changes: [] }
      const changes = detectChanges(db, row)
      if (!changes.length) return { ...row, _idx: idx, _status: 'DUPLICATE', _changes: [] }
      return { ...row, _idx: idx, _status: 'CHANGED', _changes: changes }
    })

    setPreview(annotated)
    setSkipSet(new Set())
    setStep(3)
    setLoading(false)
  }

  function toggleSkip(idx) {
    setSkipSet(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const counts = preview.reduce((acc, r) => {
    const s = skipSet.has(r._idx) ? 'SKIPPED' : r._status
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  async function doImport(includeChanged) {
    if (!entityId) return
    setImporting(true)
    setProgress(0)

    // 1. Create import session
    const { data: sess } = await supabase.from('import_sessions').insert({
      entity_id:    entityId,
      import_type:  'trip_bookings',
      import_date:  importDate,
      file_name:    fileName,
      total_rows:   preview.length,
      imported_by:  userId,
    }).select('id').single()

    const sessionId = sess?.id

    let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0

    // Process in batches of 50
    const toProcess = preview.filter(r => {
      if (skipSet.has(r._idx)) return false
      if (r._status === 'DUPLICATE') return false
      if (r._status === 'ERROR')     { errorCount++; return false }
      if (r._status === 'CHANGED' && !includeChanged) { skippedCount++; return false }
      return true
    })

    const BATCH = 50
    for (let i = 0; i < toProcess.length; i += BATCH) {
      const batch = toProcess.slice(i, i + BATCH)
      const upsertRows = batch.map(r => ({
        entity_id:          entityId,
        import_session_id:  sessionId,
        booking_ref:        r.booking_ref,
        client_name:        r.client_name     || null,
        traveler_name:      r.traveler_name   || null,
        service_type:       r.service_type    || null,
        destination:        r.destination     || null,
        travel_date:        r.travel_date     || null,
        return_date:        r.return_date     || null,
        pax_count:          r.pax_count ? +r.pax_count : 1,
        ticket_no:          r.ticket_no       || null,
        supplier:           r.supplier        || null,
        cost_amount:        r.cost_amount ? +r.cost_amount : 0,
        sale_amount:        r.sale_amount ? +r.sale_amount : 0,
        status:             r.status          || 'CONFIRMED',
        remarks:            r.remarks         || null,
        raw_data:           r.raw_data        || null,
      }))

      const { error } = await supabase.from('trip_records')
        .upsert(upsertRows, { onConflict: 'entity_id,booking_ref', ignoreDuplicates: false })
      if (error) console.error('Batch error:', error)

      batch.forEach(r => { r._status === 'NEW' ? newCount++ : updatedCount++ })
      setProgress(Math.round(((i + batch.length) / toProcess.length) * 100))
    }

    skippedCount += preview.filter(r => r._status === 'DUPLICATE').length

    // Update session stats
    if (sessionId) {
      await supabase.from('import_sessions').update({
        new_rows:     newCount,
        updated_rows: updatedCount,
        skipped_rows: skippedCount,
        error_rows:   errorCount,
      }).eq('id', sessionId)
    }

    setResult({ newCount, updatedCount, skippedCount, errorCount })
    setImporting(false)
    setStep(4)
  }

  // ── Render steps ───────────────────────────────────────────────────────────
  return (
    <div>
      {/* Step indicator */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderRadius:10, overflow:'hidden', border:'1px solid #e0e7ef' }}>
        {[
          [1,'Upload CSV'],
          [2,'Map Columns'],
          [3,'Review & Import'],
          [4,'Done'],
        ].map(([n, label]) => (
          <div key={n} style={{
            flex:1, padding:'10px 12px', textAlign:'center', fontSize:11, fontWeight:700,
            background: step === n ? '#1a2e3d' : step > n ? '#e8f5e9' : '#f8fafc',
            color:      step === n ? '#fff'    : step > n ? '#2e7d32' : '#aab2bd',
            borderRight: n < 4 ? '1px solid #e0e7ef' : 'none',
          }}>
            {step > n ? '✓ ' : `${n}. `}{label}
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:14, color:'#1a2e3d' }}>1. Select Entity & Upload CSV</div>

          <div style={{ marginBottom:12 }}>
            <label style={S.lbl}>Entity (GWT or RAT only)</label>
            <select value={entityId} onChange={e => setEntityId(e.target.value)}
              style={{ ...S.inp, width:'100%', maxWidth:300 }}>
              <option value="">— Select entity —</option>
              {entities.filter(e => ['GWT','RAT'].includes(e.entity_code)).map(e => (
                <option key={e.id} value={e.id}>{e.entity_code} — {e.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={S.lbl}>Import Date</label>
            <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)}
              style={{ ...S.inp, width:200 }} />
          </div>

          <div
            onClick={() => entityId && fileRef.current.click()}
            style={{
              border:'2px dashed #b0bec5', borderRadius:12, padding:'40px 20px',
              textAlign:'center', cursor: entityId ? 'pointer' : 'not-allowed',
              background: entityId ? '#fafbfc' : '#f5f5f5', color:'#6b7c93',
              transition:'border-color 0.2s',
            }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#1565C0' }}
            onDragLeave={e => { e.currentTarget.style.borderColor='#b0bec5' }}
            onDrop={e => {
              e.preventDefault()
              e.currentTarget.style.borderColor='#b0bec5'
              if (!entityId) return
              fileRef.current.files = e.dataTransfer.files
              handleFile({ target: { files: e.dataTransfer.files } })
            }}
          >
            <div style={{ fontSize:36, marginBottom:8 }}>📂</div>
            <div style={{ fontWeight:700, fontSize:14 }}>
              {entityId ? 'Click or drag & drop CSV file' : 'Select entity first'}
            </div>
            <div style={{ fontSize:11, marginTop:6 }}>
              Supports CSV (comma), pipe-delimited, tab-delimited · Max ~50,000 rows
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" style={{ display:'none' }} onChange={handleFile} />
        </div>
      )}

      {/* ── Step 2: Column Mapping ── */}
      {step === 2 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:4, color:'#1a2e3d' }}>
            2. Column Mapping — {fileName}
          </div>
          <div style={{ fontSize:12, color:'#6b7c93', marginBottom:14 }}>
            Auto-mapped from your CSV headers. Adjust if anything is wrong.
            <strong style={{ color:'#c62828' }}> Booking Ref is required.</strong>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:10, marginBottom:16 }}>
            {Object.entries(FIELD_ALIASES).map(([field]) => (
              <div key={field}>
                <label style={{ ...S.lbl, display:'flex', gap:4 }}>
                  <span style={{ fontFamily:'monospace', color:'#1565C0' }}>{field}</span>
                  {field === 'booking_ref' && <span style={{ color:'#c62828' }}>*</span>}
                </label>
                <select
                  value={mapping[field] || ''}
                  onChange={e => setMapping(p => ({ ...p, [field]: e.target.value || undefined }))}
                  style={{ ...S.inp, width:'100%', fontSize:12 }}
                >
                  <option value="">— not mapped —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Preview first row */}
          {rawRows[0] && (
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:11, color:'#546e7a' }}>
              <strong>First row preview:</strong> {JSON.stringify(applyMapping(rawRows[0], mapping), null, 0).slice(0, 200)}…
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button style={S.btn('#78909c')} onClick={() => { setStep(1); setRawRows([]); setHeaders([]) }}>← Back</button>
            <button style={S.btn()} onClick={runPreview} disabled={loading || !requiredMapped()}>
              {loading ? 'Checking database…' : `Analyse ${rawRows.length.toLocaleString()} rows →`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && (
        <div>
          {/* Summary bar */}
          <div style={{ ...S.card, display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontWeight:800, fontSize:15, color:'#1a2e3d', marginBottom:2 }}>
                3. Review — {preview.length.toLocaleString()} rows
              </div>
              <div style={{ fontSize:12, color:'#6b7c93' }}>{fileName}</div>
            </div>
            {Object.entries({ NEW: '#2e7d32', CHANGED: '#e65100', DUPLICATE: '#546e7a', ERROR: '#c62828', SKIPPED: '#aab2bd' }).map(([s, c]) =>
              (counts[s] || 0) > 0 ? (
                <div key={s} style={{ textAlign:'center' }}>
                  <div style={{ fontWeight:800, fontSize:20, color: c }}>{counts[s]}</div>
                  <div style={{ fontSize:10, color:'#6b7c93' }}>{s}</div>
                </div>
              ) : null
            )}
          </div>

          {/* CHANGED rows — show warning section first */}
          {preview.filter(r => r._status === 'CHANGED' && !skipSet.has(r._idx)).length > 0 && (
            <div style={{ ...S.card, borderLeft:'4px solid #e65100', background:'#fffde7' }}>
              <div style={{ fontWeight:800, color:'#e65100', marginBottom:8 }}>
                ⚠️ {preview.filter(r => r._status === 'CHANGED' && !skipSet.has(r._idx)).length} records have changed values
              </div>
              <div style={{ fontSize:12, color:'#546e7a', marginBottom:10 }}>
                These booking refs already exist in the database but some fields differ. Click each to review the diff before importing.
              </div>
              {preview.filter(r => r._status === 'CHANGED' && !skipSet.has(r._idx)).slice(0, 20).map(row => (
                <div key={row._idx} style={{
                  display:'flex', gap:10, alignItems:'center', padding:'8px 0',
                  borderBottom:'1px solid #f5e6c8', flexWrap:'wrap',
                }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontWeight:700, fontSize:12 }}>
                      {row.booking_ref}
                      <span style={{ marginLeft:8, fontWeight:400, color:'#546e7a' }}>{row.client_name}</span>
                    </div>
                    <div style={{ fontSize:11, color:'#e65100' }}>
                      {row._changes.length} field{row._changes.length !== 1 ? 's' : ''} changed:&nbsp;
                      {row._changes.map(c => c.field).join(', ')}
                    </div>
                  </div>
                  <button style={{ ...S.btn('#e65100'), padding:'5px 12px', fontSize:11 }}
                    onClick={() => setDiffRow(row)}>View diff</button>
                  <button style={{ ...S.btn('#546e7a'), padding:'5px 12px', fontSize:11 }}
                    onClick={() => toggleSkip(row._idx)}>Skip</button>
                </div>
              ))}
              {preview.filter(r => r._status === 'CHANGED').length > 20 && (
                <div style={{ fontSize:11, color:'#aab2bd', marginTop:6 }}>
                  …and {preview.filter(r => r._status === 'CHANGED').length - 20} more (use "Import All incl. Changes" to update all)
                </div>
              )}
            </div>
          )}

          {/* Full preview table (first 200 rows) */}
          <div style={{ ...S.card, overflowX:'auto' }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:'#1a2e3d' }}>
              Row Preview (first 200)
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#f0f4f8' }}>
                  {['#','Status','Booking Ref','Client','Traveler','Service','Destination','Travel Date','Cost','Sale',''].map(h => (
                    <th key={h} style={{ padding:'7px 10px', textAlign:'left', color:'#546e7a', fontWeight:700, fontSize:10, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((row, i) => {
                  const skipped = skipSet.has(row._idx)
                  const s = skipped ? 'SKIPPED' : row._status
                  const st = ROW_STATUS[s] || ROW_STATUS.DUPLICATE
                  return (
                    <tr key={row._idx} style={{
                      borderBottom:'1px solid #f5f5f5',
                      background: skipped ? '#f5f5f5' : i % 2 === 0 ? '#fff' : '#fafbfc',
                      opacity: skipped ? 0.5 : 1,
                    }}>
                      <td style={{ padding:'5px 10px', color:'#aab2bd' }}>{i + 1}</td>
                      <td style={{ padding:'5px 10px', whiteSpace:'nowrap' }}>
                        <span style={{ background: st.bg, color: st.color, padding:'2px 8px', borderRadius:8, fontWeight:700, fontSize:10 }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding:'5px 10px', fontWeight:700, fontFamily:'monospace', fontSize:10 }}>{row.booking_ref}</td>
                      <td style={{ padding:'5px 10px', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.client_name}</td>
                      <td style={{ padding:'5px 10px', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.traveler_name}</td>
                      <td style={{ padding:'5px 10px' }}>{row.service_type}</td>
                      <td style={{ padding:'5px 10px', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.destination}</td>
                      <td style={{ padding:'5px 10px', whiteSpace:'nowrap' }}>{row.travel_date}</td>
                      <td style={{ padding:'5px 10px', textAlign:'right' }}>{row.cost_amount}</td>
                      <td style={{ padding:'5px 10px', textAlign:'right', fontWeight:700 }}>{row.sale_amount}</td>
                      <td style={{ padding:'5px 10px' }}>
                        {row._status === 'CHANGED' && !skipped && (
                          <button style={{ ...S.btn('#e65100'), padding:'3px 8px', fontSize:10 }}
                            onClick={() => setDiffRow(row)}>diff</button>
                        )}
                        {!skipped && row._status !== 'DUPLICATE' && row._status !== 'ERROR' && (
                          <button style={{ ...S.btn('#aab2bd'), padding:'3px 8px', fontSize:10, marginLeft:4 }}
                            onClick={() => toggleSkip(row._idx)}>skip</button>
                        )}
                        {skipped && (
                          <button style={{ ...S.btn('#2e7d32'), padding:'3px 8px', fontSize:10 }}
                            onClick={() => toggleSkip(row._idx)}>undo</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {preview.length > 200 && (
              <div style={{ textAlign:'center', padding:'10px 0', fontSize:11, color:'#aab2bd' }}>
                Showing first 200 of {preview.length.toLocaleString()} rows
              </div>
            )}
          </div>

          {/* Import actions */}
          {importing ? (
            <div style={{ ...S.card, textAlign:'center', padding:30 }}>
              <div style={{ fontWeight:700, marginBottom:10 }}>Importing… {progress}%</div>
              <div style={{ height:10, borderRadius:5, background:'#f0f4f8', overflow:'hidden', maxWidth:400, margin:'0 auto' }}>
                <div style={{ height:'100%', borderRadius:5, background:'#1565C0', width:`${progress}%`, transition:'width 0.3s' }} />
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:4 }}>
              <button style={S.btn('#78909c')} onClick={() => setStep(2)}>← Back</button>
              <div style={{ flex:1 }} />
              <button
                style={S.btn('#2e7d32')}
                onClick={() => doImport(false)}
                disabled={!counts.NEW}
              >
                ✅ Import {(counts.NEW || 0).toLocaleString()} New Records Only
              </button>
              {(counts.CHANGED || 0) > 0 && (
                <button style={S.btn('#e65100')} onClick={() => doImport(true)}>
                  ⚠️ Import New + Update {counts.CHANGED} Changed
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {step === 4 && result && (
        <div style={{ ...S.card, textAlign:'center', padding:40 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          <div style={{ fontWeight:800, fontSize:18, color:'#1a2e3d', marginBottom:16 }}>Import Complete!</div>
          <div style={{ display:'flex', gap:24, justifyContent:'center', flexWrap:'wrap', marginBottom:24 }}>
            {[
              ['New records added',  result.newCount,     '#2e7d32'],
              ['Records updated',    result.updatedCount, '#e65100'],
              ['Duplicates skipped', result.skippedCount, '#546e7a'],
              ['Errors',             result.errorCount,   '#c62828'],
            ].map(([l, n, c]) => (
              <div key={l}>
                <div style={{ fontWeight:800, fontSize:26, color: c }}>{n}</div>
                <div style={{ fontSize:11, color:'#6b7c93' }}>{l}</div>
              </div>
            ))}
          </div>
          <button style={S.btn()} onClick={() => {
            setStep(1); setFileName(''); setHeaders([]); setRawRows([])
            setMapping({}); setPreview([]); setResult(null)
          }}>
            Upload Another File
          </button>
        </div>
      )}

      <DiffModal
        row={diffRow}
        onClose={() => setDiffRow(null)}
        onSkip={() => { toggleSkip(diffRow._idx); setDiffRow(null) }}
        onAccept={() => setDiffRow(null)}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Generic CSV import (Employees / Contractors / Projects)
// ═══════════════════════════════════════════════════════════════════
const GENERIC_CONFIG = {
  employees: {
    label:    'Employee Import',
    table:    'employees',
    uniqueBy: ['employee_id','iqama_no','national_id'],
    fields:   [
      { key:'full_name',          label:'Full Name (Arabic)' },
      { key:'full_name_en',       label:'Full Name (English)' },
      { key:'employee_id',        label:'Employee ID' },
      { key:'iqama_no',           label:'Iqama / National ID' },
      { key:'nationality',        label:'Nationality' },
      { key:'job_title',          label:'Job Title' },
      { key:'department',         label:'Department' },
      { key:'basic_salary',       label:'Basic Salary' },
      { key:'housing_allowance',  label:'Housing Allowance' },
      { key:'transport_allowance',label:'Transport Allowance' },
      { key:'join_date',          label:'Join Date' },
      { key:'email',              label:'Email' },
      { key:'mobile',             label:'Mobile' },
      { key:'bank_iban',          label:'IBAN' },
      { key:'bank_name',          label:'Bank Name' },
    ],
  },
  contractors: {
    label:    'Contractor Import',
    table:    'contractors',
    uniqueBy: ['cr_number','vat_number'],
    fields:   [
      { key:'company_name',    label:'Company Name' },
      { key:'vendor_type',     label:'Type (Contractor/Supplier/Sub-Contractor)' },
      { key:'cr_number',       label:'CR Number' },
      { key:'vat_number',      label:'VAT Number' },
      { key:'contact_person',  label:'Contact Person' },
      { key:'email',           label:'Email' },
      { key:'phone',           label:'Phone' },
      { key:'city',            label:'City' },
      { key:'iban',            label:'IBAN' },
    ],
  },
  projects: {
    label:   'Project Import',
    table:   'projects',
    uniqueBy:['project_number'],
    fields:  [
      { key:'project_number',  label:'Project Number' },
      { key:'name',            label:'Project Name' },
      { key:'client_name',     label:'Client Name' },
      { key:'status',          label:'Status' },
      { key:'start_date',      label:'Start Date' },
      { key:'end_date',        label:'End Date' },
      { key:'budget_amount',   label:'Budget Amount' },
      { key:'description',     label:'Description' },
    ],
  },
}

function GenericImport({ config, entityId }) {
  const [fileName, setFileName]  = useState('')
  const [headers,  setHeaders]   = useState([])
  const [rawRows,  setRawRows]   = useState([])
  const [mapping,  setMapping]   = useState({})
  const [preview,  setPreview]   = useState([])
  const [step,     setStep]      = useState(1)
  const [loading,  setLoading]   = useState(false)
  const [result,   setResult]    = useState(null)
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const { headers: h, rows } = parseCSV(ev.target.result)
      setHeaders(h)
      setRawRows(rows)
      // Basic auto-map
      const m = {}
      config.fields.forEach(f => {
        const match = h.find(h2 =>
          h2.toLowerCase().replace(/[\s_-]/g,'') === f.key.toLowerCase().replace(/[\s_-]/g,'') ||
          h2.toLowerCase().includes(f.label.toLowerCase().split('(')[0].trim().toLowerCase())
        )
        if (match) m[f.key] = match
      })
      setMapping(m)
      setStep(2)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function runPreview() {
    setLoading(true)
    const normalized = rawRows.map(r => applyMapping(r, mapping))

    // Fetch existing by unique keys
    const uniqueField = config.uniqueBy[0]
    const uniqueVals  = [...new Set(normalized.map(r => r[uniqueField]).filter(Boolean))]
    const { data: existing } = uniqueVals.length
      ? await supabase.from(config.table).select('*').eq('entity_id', entityId).in(uniqueField, uniqueVals)
      : { data: [] }

    const existingMap = {}
    ;(existing || []).forEach(r => { existingMap[r[uniqueField]] = r })

    const annotated = normalized.map((row, idx) => {
      const key = row[uniqueField]
      if (!key) return { ...row, _idx: idx, _status: 'ERROR', _error: `Missing ${uniqueField}` }
      const db = existingMap[key]
      if (!db) return { ...row, _idx: idx, _status: 'NEW',       _changes: [] }
      const changes = config.fields.filter(f => {
        const oldV = String(db[f.key]  || '').trim()
        const newV = String(row[f.key] || '').trim()
        return oldV !== newV && newV !== ''
      }).map(f => ({ field: f.key, old: db[f.key], new: row[f.key] }))
      return changes.length
        ? { ...row, _idx: idx, _status: 'CHANGED',   _changes: changes }
        : { ...row, _idx: idx, _status: 'DUPLICATE', _changes: [] }
    })

    setPreview(annotated)
    setStep(3)
    setLoading(false)
  }

  async function doImport() {
    const toInsert  = preview.filter(r => r._status === 'NEW').map(r => ({ entity_id: entityId, ...r,
      _idx:undefined, _status:undefined, _changes:undefined, _error:undefined }))
    const toUpdate  = preview.filter(r => r._status === 'CHANGED')

    if (toInsert.length) {
      await supabase.from(config.table).insert(toInsert)
    }
    for (const row of toUpdate) {
      const payload = { ...row }
      ;['_idx','_status','_changes','_error'].forEach(k => delete payload[k])
      await supabase.from(config.table).update(payload)
        .eq('entity_id', entityId).eq(config.uniqueBy[0], row[config.uniqueBy[0]])
    }
    setResult({ new: toInsert.length, updated: toUpdate.length, skipped: preview.filter(r=>r._status==='DUPLICATE').length })
    setStep(4)
  }

  const counts = preview.reduce((a, r) => { a[r._status] = (a[r._status]||0)+1; return a }, {})

  return (
    <div>
      {step === 1 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>{config.label}</div>
          <div style={{ marginBottom:12, fontSize:12, color:'#546e7a' }}>
            Unique key: <code style={{ background:'#f0f4f8', padding:'2px 6px', borderRadius:4 }}>{config.uniqueBy[0]}</code> — rows with this value already in the database will be flagged as CHANGED or DUPLICATE.
          </div>
          <div onClick={() => fileRef.current.click()}
            style={{ border:'2px dashed #b0bec5', borderRadius:10, padding:'36px', textAlign:'center', cursor:'pointer', background:'#fafbfc' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
            <div style={{ fontWeight:700 }}>Click to upload CSV</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={handleFile} />
        </div>
      )}

      {step === 2 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>Map Columns — {fileName}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:8, marginBottom:14 }}>
            {config.fields.map(f => (
              <div key={f.key}>
                <label style={S.lbl}>{f.label}</label>
                <select value={mapping[f.key]||''} onChange={e=>setMapping(p=>({...p,[f.key]:e.target.value||undefined}))}
                  style={{ ...S.inp, width:'100%', fontSize:12 }}>
                  <option value="">— not mapped —</option>
                  {headers.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button style={S.btn('#78909c')} onClick={()=>setStep(1)}>← Back</button>
            <button style={S.btn()} onClick={runPreview} disabled={loading}>
              {loading ? 'Analysing…' : `Analyse ${rawRows.length.toLocaleString()} rows →`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ ...S.card, display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:14 }}>Review — {preview.length.toLocaleString()} rows · {fileName}</div>
            </div>
            {[['NEW','#2e7d32'],['CHANGED','#e65100'],['DUPLICATE','#546e7a'],['ERROR','#c62828']].map(([s,c])=>
              (counts[s]||0) > 0 ? (
                <div key={s} style={{ textAlign:'center' }}>
                  <div style={{ fontWeight:800, fontSize:20, color:c }}>{counts[s]}</div>
                  <div style={{ fontSize:10, color:'#6b7c93' }}>{s}</div>
                </div>
              ) : null
            )}
          </div>

          {(counts.CHANGED||0) > 0 && (
            <div style={{ ...S.card, borderLeft:'4px solid #e65100', background:'#fff8e1', fontSize:12, color:'#546e7a' }}>
              ⚠️ <strong>{counts.CHANGED}</strong> records have changed values. They will be updated in the database when you import.
            </div>
          )}

          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button style={S.btn('#78909c')} onClick={()=>setStep(2)}>← Back</button>
            <div style={{ flex:1 }} />
            <button style={S.btn('#2e7d32')} onClick={doImport} disabled={!counts.NEW && !counts.CHANGED}>
              Import ({((counts.NEW||0) + (counts.CHANGED||0)).toLocaleString()} records)
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div style={{ ...S.card, textAlign:'center', padding:40 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
          <div style={{ fontWeight:800, fontSize:16, marginBottom:12 }}>Done!</div>
          <div style={{ display:'flex', gap:20, justifyContent:'center', marginBottom:16 }}>
            <div><div style={{ fontWeight:800, fontSize:22, color:'#2e7d32' }}>{result.new}</div><div style={{ fontSize:11, color:'#6b7c93' }}>Added</div></div>
            <div><div style={{ fontWeight:800, fontSize:22, color:'#e65100' }}>{result.updated}</div><div style={{ fontSize:11, color:'#6b7c93' }}>Updated</div></div>
            <div><div style={{ fontWeight:800, fontSize:22, color:'#546e7a' }}>{result.skipped}</div><div style={{ fontSize:11, color:'#6b7c93' }}>Skipped</div></div>
          </div>
          <button style={S.btn()} onClick={()=>{ setStep(1); setFileName(''); setPreview([]); setResult(null) }}>
            Import Another File
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Import History Tab
// ═══════════════════════════════════════════════════════════════════
function ImportHistory({ entityId }) {
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const fmtDt = d => d ? new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'

  useState(() => { fetchHistory() }, [entityId])

  async function fetchHistory() {
    setLoading(true)
    const { data } = await supabase.from('import_sessions')
      .select('*, user_profiles(full_name)')
      .eq('entity_id', entityId)
      .order('imported_at', { ascending: false })
      .limit(50)
    setSessions(data || [])
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, alignItems:'center' }}>
        <span style={{ fontWeight:700, color:'#1a2e3d', fontSize:14 }}>Import History</span>
        <button style={S.btn('#546e7a')} onClick={fetchHistory}>↻ Refresh</button>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div>
      ) : sessions.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>No imports yet</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f0f4f8' }}>
                {['Date','File','Type','Total','New','Updated','Skipped','By'].map(h=>(
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, color:'#546e7a', fontWeight:700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s,i) => (
                <tr key={s.id} style={{ borderBottom:'1px solid #f5f5f5', background: i%2===0?'#fff':'#fafbfc' }}>
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>{fmtDt(s.imported_at)}</td>
                  <td style={{ padding:'8px 12px', color:'#1565C0', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.file_name}</td>
                  <td style={{ padding:'8px 12px' }}>{s.import_type}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right' }}>{s.total_rows?.toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'#2e7d32', fontWeight:700 }}>{s.new_rows}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'#e65100' }}>{s.updated_rows}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'#546e7a' }}>{s.skipped_rows}</td>
                  <td style={{ padding:'8px 12px' }}>{s.user_profiles?.full_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function DataMigration({ entityId, role }) {
  const [tab,      setTab]      = useState('bookings')
  const [entities, setEntities] = useState([])
  const [userId,   setUserId]   = useState(null)

  useState(() => {
    supabase.from('entities').select('id, entity_name, entity_code').then(({ data }) => setEntities((data||[]).map(e=>({...e,name:e.entity_name}))))
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id))
  }, [])

  const TABS = [
    { key:'bookings',    label:'✈️ Daily Booking Import', badge:'GWT · RAT' },
    { key:'employees',   label:'👷 Employee Import'  },
    { key:'contractors', label:'🏢 Contractor Import' },
    { key:'projects',    label:'📁 Project Import'   },
    { key:'history',     label:'📋 Import History'   },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:20 }}>
        Upload CSV files — duplicates are detected automatically, changes require review
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2, borderBottom:'2px solid #f0f4f8', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'9px 16px', border:'none', borderRadius:'8px 8px 0 0',
            cursor:'pointer', fontWeight:700, fontSize:12,
            background:   tab === t.key ? '#1a2e3d' : 'transparent',
            color:        tab === t.key ? '#fff'    : '#6b7c93',
          }}>
            {t.label}
            {t.badge && <span style={{ marginLeft:6, fontSize:9, background:'rgba(255,255,255,0.2)', padding:'1px 5px', borderRadius:6 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'bookings'    && <BookingImport entities={entities} userId={userId} />}
      {tab === 'employees'   && <GenericImport config={GENERIC_CONFIG.employees}   entityId={entityId} />}
      {tab === 'contractors' && <GenericImport config={GENERIC_CONFIG.contractors} entityId={entityId} />}
      {tab === 'projects'    && <GenericImport config={GENERIC_CONFIG.projects}    entityId={entityId} />}
      {tab === 'history'     && <ImportHistory entityId={entityId} />}
    </div>
  )
}
