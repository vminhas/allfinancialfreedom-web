'use client'

import { useEffect, useState, useCallback } from 'react'

const card = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14 }
const inputStyle = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }
const fieldLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C9A96E', display: 'block', marginBottom: 4 }

const POLICY_TYPES = [
  { value: 'TERM', label: 'Term' },
  { value: 'WHOLE_LIFE', label: 'Whole Life' },
  { value: 'IUL', label: 'IUL' },
  { value: 'ANNUITY', label: 'Annuity' },
  { value: 'DISABILITY', label: 'Disability' },
  { value: 'LTC', label: 'LTC' },
  { value: 'OTHER', label: 'Other' },
] as const

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  ISSUED: { bg: 'rgba(74,222,128,0.15)', fg: '#4ADE80' },
  DECLINED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  LAPSED: { bg: 'rgba(107,114,128,0.2)', fg: '#9CA3AF' },
  NOT_TAKEN: { bg: 'rgba(107,114,128,0.2)', fg: '#9CA3AF' },
}

interface SubmissionNote {
  id: string
  body: string
  authorType: 'AGENT' | 'ADMIN'
  authorAgent: { firstName: string; lastName: string } | null
  authorAdmin: { name: string } | null
  createdAt: string
}
interface Submission {
  id: string
  applicationDate: string
  carrier: string
  policyType: string
  points: number | null
  illustrationUrls: string[]
  splitWithAgent: { firstName: string; lastName: string; agentCode: string } | null
  clientFirstName: string
  clientLastName: string
  clientPhone: string | null
  clientEmail: string | null
  clientBirthday: string | null
  status: 'PENDING' | 'ISSUED' | 'DECLINED' | 'LAPSED' | 'NOT_TAKEN'
  issuedDate: string | null
  policyNumber: string | null
  declinedReason: string | null
  notes: SubmissionNote[]
  createdAt: string
}

export default function NewBusinessTab({ isMobile }: { isMobile: boolean }) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetch('/api/agents/new-business')
      .then(r => r.ok ? r.json() : { submissions: [] })
      .then((d: { submissions: Submission[] }) => {
        setSubmissions(d.submissions ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const opened = submissions.find(s => s.id === openId) ?? null

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={sectionLabel}>New Business ({submissions.length})</div>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Submit New Business'}
        </button>
      </div>

      {showForm && <NewBusinessForm isMobile={isMobile} onSaved={() => { refresh(); setShowForm(false) }} />}

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        submissions.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No submissions yet.</div> :
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Client', 'Carrier', 'Type', 'Points', 'Status', 'Submitted'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {submissions.map(s => (
              <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{s.clientFirstName} {s.clientLastName}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{s.carrier}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{POLICY_TYPES.find(p => p.value === s.policyType)?.label ?? s.policyType}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#C9A96E' }}>{s.points ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 11 }}><StatusPill status={s.status} /></td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }

      {opened && <SubmissionDrawer submission={opened} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.PENDING
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    }}>{status.replace('_', ' ')}</span>
  )
}

function NewBusinessForm({ isMobile, onSaved }: { isMobile: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    applicationDate: '', carrier: '', policyType: 'TERM', points: '',
    clientFirstName: '', clientLastName: '', clientPhone: '', clientEmail: '', clientBirthday: '',
    clientAddressLine1: '', clientAddressLine2: '', clientCity: '', clientState: '', clientZip: '',
  })
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const fd = new FormData()
      for (const [k, v] of Object.entries(form)) fd.append(k, v)
      for (const f of files) fd.append('illustrations', f)
      const res = await fetch('/api/agents/new-business', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Submission failed')
        return
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }

  return (
    <form onSubmit={submit} style={{ marginBottom: 20, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
      <div style={{ ...sectionLabel, fontSize: 9, marginBottom: 8 }}>Application</div>
      <div style={grid}>
        <div><label style={fieldLabel}>Application Date *</label><input required type="date" style={inputStyle} value={form.applicationDate} onChange={e => setForm(f => ({ ...f, applicationDate: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Carrier *</label><input required style={inputStyle} value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Policy Type *</label>
          <select style={inputStyle} value={form.policyType} onChange={e => setForm(f => ({ ...f, policyType: e.target.value }))}>
            {POLICY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div><label style={fieldLabel}>Points</label><input type="number" step="0.1" style={inputStyle} value={form.points} onChange={e => setForm(f => ({ ...f, points: e.target.value }))} /></div>
      </div>

      <div style={{ ...sectionLabel, fontSize: 9, margin: '14px 0 8px' }}>Client</div>
      <div style={grid}>
        <div><label style={fieldLabel}>First Name *</label><input required style={inputStyle} value={form.clientFirstName} onChange={e => setForm(f => ({ ...f, clientFirstName: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Last Name *</label><input required style={inputStyle} value={form.clientLastName} onChange={e => setForm(f => ({ ...f, clientLastName: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Email</label><input type="email" style={inputStyle} value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Birthday</label><input type="date" style={inputStyle} value={form.clientBirthday} onChange={e => setForm(f => ({ ...f, clientBirthday: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Address</label><input style={inputStyle} value={form.clientAddressLine1} onChange={e => setForm(f => ({ ...f, clientAddressLine1: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Address Line 2</label><input style={inputStyle} value={form.clientAddressLine2} onChange={e => setForm(f => ({ ...f, clientAddressLine2: e.target.value }))} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
          <div><label style={fieldLabel}>City</label><input style={inputStyle} value={form.clientCity} onChange={e => setForm(f => ({ ...f, clientCity: e.target.value }))} /></div>
          <div><label style={fieldLabel}>State</label><input style={inputStyle} maxLength={2} value={form.clientState} onChange={e => setForm(f => ({ ...f, clientState: e.target.value.toUpperCase() }))} /></div>
          <div><label style={fieldLabel}>Zip</label><input style={inputStyle} value={form.clientZip} onChange={e => setForm(f => ({ ...f, clientZip: e.target.value }))} /></div>
        </div>
      </div>

      <div style={{ ...sectionLabel, fontSize: 9, margin: '14px 0 8px' }}>Illustrations</div>
      <input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => setFiles(Array.from(e.target.files ?? []))} style={{ color: '#9BB0C4', fontSize: 12 }} />
      {files.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: '#9BB0C4' }}>{files.length} file(s) ready to upload</div>}

      {error && <div style={{ marginTop: 12, color: '#EF4444', fontSize: 12 }}>{error}</div>}
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Submitting...' : 'Submit'}</button>
      </div>
    </form>
  )
}

function SubmissionDrawer({ submission, onClose, onChanged }: { submission: Submission; onClose: () => void; onChanged: () => void }) {
  const [noteText, setNoteText] = useState('')
  const [posting, setPosting] = useState(false)

  const addNote = async () => {
    if (!noteText.trim()) return
    setPosting(true)
    try {
      const res = await fetch(`/api/agents/new-business/${submission.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteText.trim() }),
      })
      if (res.ok) { setNoteText(''); onChanged() }
    } finally { setPosting(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '95vw', height: '100vh', background: '#0F1E33', borderLeft: '1px solid rgba(201,169,110,0.2)', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>{submission.clientFirstName} {submission.clientLastName}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9BB0C4', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}><StatusPill status={submission.status} /></div>

        <DetailRow k="Carrier" v={submission.carrier} />
        <DetailRow k="Policy Type" v={POLICY_TYPES.find(p => p.value === submission.policyType)?.label ?? submission.policyType} />
        <DetailRow k="Points" v={submission.points?.toString() ?? '—'} />
        <DetailRow k="Application Date" v={new Date(submission.applicationDate).toLocaleDateString()} />
        {submission.policyNumber && <DetailRow k="Policy Number" v={submission.policyNumber} />}
        {submission.issuedDate && <DetailRow k="Issued" v={new Date(submission.issuedDate).toLocaleDateString()} />}
        {submission.declinedReason && <DetailRow k="Declined Reason" v={submission.declinedReason} />}
        {submission.splitWithAgent && <DetailRow k="Split With" v={`${submission.splitWithAgent.firstName} ${submission.splitWithAgent.lastName}`} />}
        <DetailRow k="Client Phone" v={submission.clientPhone ?? '—'} />
        <DetailRow k="Client Email" v={submission.clientEmail ?? '—'} />

        {submission.illustrationUrls.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...sectionLabel, fontSize: 9 }}>Illustrations</div>
            {submission.illustrationUrls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: '#C9A96E', fontSize: 12, marginBottom: 4 }}>
                Illustration {i + 1} ↗
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div style={{ ...sectionLabel, fontSize: 9 }}>Notes</div>
          <div style={{ marginBottom: 12 }}>
            {submission.notes.length === 0 && <div style={{ color: '#4B5563', fontSize: 12 }}>No notes yet.</div>}
            {submission.notes.map(n => (
              <div key={n.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, marginBottom: 6, borderLeft: `3px solid ${n.authorType === 'ADMIN' ? '#9B6DFF' : '#C9A96E'}` }}>
                <div style={{ fontSize: 10, color: n.authorType === 'ADMIN' ? '#9B6DFF' : '#C9A96E', fontWeight: 700, marginBottom: 4 }}>
                  {n.authorType === 'ADMIN' ? `Coordinator: ${n.authorAdmin?.name ?? 'Admin'}` : `${n.authorAgent?.firstName ?? 'Agent'} ${n.authorAgent?.lastName ?? ''}`}
                  <span style={{ color: '#6B8299', fontWeight: 400, marginLeft: 8 }}>{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ color: '#E5E7EB', fontSize: 12, whiteSpace: 'pre-wrap' }}>{n.body}</div>
              </div>
            ))}
          </div>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note..."
            style={{ ...inputStyle, height: 70, resize: 'vertical' }}
          />
          <button onClick={addNote} disabled={posting || !noteText.trim()} style={{ marginTop: 8, background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: posting ? 'wait' : 'pointer', opacity: posting || !noteText.trim() ? 0.6 : 1 }}>
            {posting ? 'Posting...' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
      <div style={{ width: 130, color: '#6B8299' }}>{k}</div>
      <div style={{ color: '#E5E7EB', flex: 1 }}>{v}</div>
    </div>
  )
}
