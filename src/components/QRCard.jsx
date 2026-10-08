/**
 * QRCard — reusable QR code display + print modal
 *
 * Usage:
 *   <QRCard token="EMP-AB12CD34" name="Sarzameen Khan" sub="NISU · EMP-042" type="employee" />
 *   <QRCard token="SUB-XY78EF90" name="Al Faris Civil" sub="Sub-Contractor · TISU" type="subcon" />
 *
 * QR encodes: {origin}/field?qr={token}
 * Uses api.qrserver.com — no npm package needed.
 */

import { useState } from 'react'

const TYPE_COLOR = {
  employee: { bg:'#1565c0', badge:'#e3f2fd', badgeText:'#1565c0', icon:'👤', label:'EMPLOYEE' },
  subcon:   { bg:'#e65100', badge:'#fff3e0', badgeText:'#e65100', icon:'🔧', label:'SUB-CON'  },
  po:       { bg:'#2e7d32', badge:'#e8f5e9', badgeText:'#2e7d32', icon:'📄', label:'PO'       },
}

function qrUrl(token, size = 200) {
  const data = encodeURIComponent(`${window.location.origin}/field?qr=${token}`)
  return `https://api.qrserver.com/v1/create-qr-code/?data=${data}&size=${size}x${size}&margin=8&color=1a2540`
}

// ── Inline print styles ───────────────────────────────────────────────────────
const PRINT_HTML = ({ token, name, sub, type, origin }) => `
<!DOCTYPE html><html><head><title>ID Card — ${name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: system-ui, sans-serif; background:#fff; display:flex; justify-content:center; align-items:center; min-height:100vh; }
  .card { width:85.6mm; min-height:54mm; border-radius:6mm; padding:6mm; background:#fff; border:1px solid #dde3ec; display:flex; gap:4mm; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.12); }
  .left { flex:1; }
  .logo { font-size:9pt; font-weight:900; color:#1a2540; letter-spacing:-0.5px; }
  .accsys { font-size:7pt; color:#6b7c93; margin-bottom:3mm; }
  .name { font-size:10pt; font-weight:800; color:#1a2540; line-height:1.2; }
  .sub { font-size:7pt; color:#6b7c93; margin-top:1mm; }
  .badge { display:inline-block; font-size:6pt; font-weight:800; padding:1mm 2mm; border-radius:3mm; margin-top:2mm; }
  .right { display:flex; flex-direction:column; align-items:center; gap:1mm; }
  .qr { width:20mm; height:20mm; }
  .scan { font-size:5pt; color:#aab2bd; text-align:center; }
  .token { font-size:5pt; color:#aab2bd; font-family:monospace; }
</style>
</head><body>
<div class="card">
  <div class="left">
    <div class="logo">RATAL GROUP</div>
    <div class="accsys">ACCSYS Division</div>
    <div class="name">${name}</div>
    <div class="sub">${sub}</div>
    <span class="badge" style="background:${TYPE_COLOR[type]?.badge||'#f0f4f8'};color:${TYPE_COLOR[type]?.badgeText||'#6b7c93'}">
      ${TYPE_COLOR[type]?.icon} ${TYPE_COLOR[type]?.label}
    </span>
  </div>
  <div class="right">
    <img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`${origin}/field?qr=${token}`)}&size=200x200&margin=4&color=1a2540" />
    <div class="scan">Scan to check in</div>
    <div class="token">${token}</div>
  </div>
</div>
</body></html>`

export function QRButton({ token, name, sub, type = 'employee', size = 'sm' }) {
  const [open, setOpen] = useState(false)
  const btnStyle = size === 'sm'
    ? { background:'#e3f2fd', color:'#1565c0', border:'none', borderRadius:6, padding:'3px 10px', cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }
    : { background:'#1565c0', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(true)}>
        ⬛ QR
      </button>
      {open && (
        <QRModal token={token} name={name} sub={sub} type={type} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

export function QRModal({ token, name, sub, type = 'employee', onClose }) {
  const tc = TYPE_COLOR[type] || TYPE_COLOR.employee

  function printCard() {
    const win = window.open('', '_blank', 'width=400,height=300')
    win.document.write(PRINT_HTML({ token, name, sub, type, origin: window.location.origin }))
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 600)
  }

  const fieldUrl = `${window.location.origin}/field?qr=${token}`

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:20, padding:32, width:340, maxWidth:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.22)', textAlign:'center' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:17, fontWeight:800, color:'#1a2540' }}>{name}</div>
            <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>{sub}</div>
            <span style={{ display:'inline-block', background:tc.badge, color:tc.badgeText, borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:800, marginTop:6 }}>
              {tc.icon} {tc.label}
            </span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aab2bd', padding:0 }}>✕</button>
        </div>

        {/* QR Code */}
        <div style={{ background:'#f8fafd', borderRadius:16, padding:20, marginBottom:20, display:'inline-block' }}>
          <img
            src={qrUrl(token, 220)}
            alt={`QR for ${name}`}
            style={{ width:180, height:180, display:'block' }}
          />
        </div>

        {/* Token */}
        <div style={{ fontFamily:'monospace', fontSize:13, color:'#6b7c93', background:'#f0f4f8', borderRadius:8, padding:'6px 12px', marginBottom:8, letterSpacing:1 }}>
          {token}
        </div>

        {/* URL */}
        <div style={{ fontSize:11, color:'#aab2bd', marginBottom:20, wordBreak:'break-all' }}>
          {fieldUrl}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={printCard}
            style={{ flex:1, background:'linear-gradient(135deg,#1565c0,#1976d2)', color:'#fff', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:700, cursor:'pointer' }}>
            🖨️ Print ID Card
          </button>
          <button onClick={() => navigator.clipboard?.writeText(fieldUrl).then(() => alert('Link copied!'))}
            style={{ background:'#e3f2fd', color:'#1565c0', border:'none', borderRadius:10, padding:'12px 16px', fontSize:14, cursor:'pointer', fontWeight:700 }}>
            📋 Copy
          </button>
        </div>

        <div style={{ fontSize:11, color:'#aab2bd', marginTop:14 }}>
          Field worker scans this QR → opens their portal with all forms pre-filled
        </div>
      </div>
    </div>
  )
}

// Default export for convenience
export default QRButton
