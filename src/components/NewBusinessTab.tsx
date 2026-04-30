'use client'

import { useEffect, useState, useCallback } from 'react'
import DatePicker from './DatePicker'
import { CARRIERS } from '@/lib/agent-constants'
import { formatPhoneAsTyped } from '@/lib/contact-validation'

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
interface RenewalReminder {
  id: string
  stage: 'SIXTY_DAYS' | 'THIRTY_DAYS' | 'SEVEN_DAYS'
  anniversaryYear: number
  sentAt: string
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
  renewalReminders: RenewalReminder[]
  createdAt: string
  daysUntilAnniversary: number | null
  currentStage: 'SIXTY_DAYS' | 'THIRTY_DAYS' | 'SEVEN_DAYS' | null
  anniversaryYear: number | null
}

type Filter = 'all' | 'pending' | 'clients'

function anniversaryColor(daysUntil: number | null): string {
  if (daysUntil == null) return '#4B5563'
  if (daysUntil <= 7) return '#EF4444'
  if (daysUntil <= 30) return '#C9A96E'
  if (daysUntil <= 60) return '#9B6DFF'
  return '#6B8299'
}

export default function NewBusinessTab({ isMobile, phase }: { isMobile: boolean; phase: number }) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const refresh = useCallback(() => {
    fetch('/api/agents/new-business')
      .then(async r => {
        if (r.status === 403) { setLocked(true); setLoading(false); return null }
        return r.ok ? r.json() : null
      })
      .then((d: { submissions: Submission[] } | null) => {
        if (d?.submissions) setSubmissions(d.submissions)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (locked || phase < 4) {
    return (
      <div style={{ ...card, padding: '40px 28px', textAlign: 'center' }}>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>New Business &middot; Locked</div>
        <div style={{ color: '#9BB0C4', fontSize: 13, marginBottom: 4 }}>
          Unlocks at Phase 4 (Marketing Director track).
        </div>
        <div style={{ color: '#6B8299', fontSize: 12 }}>
          Once you reach Phase 4 you can submit new business and your issued policies will appear here as clients with anniversary reminders.
        </div>
      </div>
    )
  }

  const opened = submissions.find(s => s.id === openId) ?? null

  // Filter the table based on the pill selection
  const filtered = submissions.filter(s => {
    if (filter === 'pending') return s.status === 'PENDING'
    if (filter === 'clients') return s.status === 'ISSUED'
    return true
  })

  // Sort: when on the Clients filter, pin upcoming anniversaries to top.
  const sorted = filter === 'clients'
    ? [...filtered].sort((a, b) => {
        const ad = a.daysUntilAnniversary ?? 999
        const bd = b.daysUntilAnniversary ?? 999
        return ad - bd
      })
    : filtered

  // Issued submissions in any active stage — feed the Coming-up banner.
  const upcoming = submissions
    .filter(s => s.status === 'ISSUED' && s.currentStage)
    .sort((a, b) => (a.daysUntilAnniversary ?? 999) - (b.daysUntilAnniversary ?? 999))

  const showAnniversaryCol = filter !== 'pending'

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={sectionLabel}>New Business ({submissions.length})</div>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Submit New Business'}
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['all', 'pending', 'clients'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: filter === f ? 'rgba(201,169,110,0.15)' : 'transparent',
              border: `1px solid ${filter === f ? 'rgba(201,169,110,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f ? '#C9A96E' : '#6B8299',
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Issued / Clients'}
          </button>
        ))}
      </div>

      {/* Coming up banner — only when there are issued clients in an active stage */}
      {upcoming.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(201,169,110,0.10), rgba(201,169,110,0.02))',
          border: '1px solid rgba(201,169,110,0.30)', borderRadius: 6,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ ...sectionLabel, fontSize: 9, marginBottom: 8 }}>
            Coming up in 90 days · {upcoming.length}
          </div>
          {upcoming.slice(0, 5).map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
              <span style={{ color: '#fff' }}>{u.clientFirstName} {u.clientLastName} · <span style={{ color: '#9BB0C4' }}>{u.carrier}</span></span>
              <span style={{ color: anniversaryColor(u.daysUntilAnniversary), fontWeight: 700 }}>
                {u.daysUntilAnniversary === 0 ? 'Today' : `in ${u.daysUntilAnniversary}d`}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#6B8299', marginTop: 8, fontStyle: 'italic' }}>
            Renewal reminders are sent by your licensing coordinator. You can call your client anytime.
          </div>
        </div>
      )}

      {showForm && <NewBusinessForm isMobile={isMobile} onSaved={() => { refresh(); setShowForm(false) }} />}

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        sorted.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No submissions match this filter.</div> :
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {(['Client', 'Carrier', 'Type', 'Points', 'Status', 'Submitted', ...(showAnniversaryCol ? ['Next Anniversary'] : [])]).map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{s.clientFirstName} {s.clientLastName}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{s.carrier}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{POLICY_TYPES.find(p => p.value === s.policyType)?.label ?? s.policyType}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#C9A96E' }}>{s.points ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 11 }}><StatusPill status={s.status} /></td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                {showAnniversaryCol && (
                  <td style={{ padding: '10px 12px', fontSize: 11 }}>
                    {s.daysUntilAnniversary != null ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                        background: `${anniversaryColor(s.daysUntilAnniversary)}26`,
                        color: anniversaryColor(s.daysUntilAnniversary),
                        fontWeight: 700, letterSpacing: '0.08em',
                      }}>
                        {s.daysUntilAnniversary === 0 ? 'Today' : `${s.daysUntilAnniversary}d`}
                      </span>
                    ) : <span style={{ color: '#4B5563' }}>—</span>}
                  </td>
                )}
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
        <div><label style={fieldLabel}>Application Date *</label>
          <DatePicker value={form.applicationDate} onChange={v => setForm(f => ({ ...f, applicationDate: v }))} required />
        </div>
        <div><label style={fieldLabel}>Carrier *</label>
          <select required style={inputStyle} value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))}>
            <option value="">Select carrier...</option>
            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
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
        <div><label style={fieldLabel}>Phone *</label>
          <input
            required
            type="tel"
            pattern="^\s*\+?1?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\s*$"
            title="10-digit US phone, e.g. (555) 123-4567"
            placeholder="e.g. (555) 123-4567"
            style={inputStyle}
            value={form.clientPhone}
            onChange={e => setForm(f => ({ ...f, clientPhone: formatPhoneAsTyped(e.target.value) }))}
            inputMode="numeric"
          />
        </div>
        <div><label style={fieldLabel}>Email *</label>
          <input
            required
            type="email"
            placeholder="client@example.com"
            style={inputStyle}
            value={form.clientEmail}
            onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))}
          />
        </div>
        <div><label style={fieldLabel}>Birthday</label>
          <DatePicker value={form.clientBirthday} onChange={v => setForm(f => ({ ...f, clientBirthday: v }))} max={new Date().toISOString().slice(0, 10)} />
        </div>
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
  // Edit mode state. Only available while status === PENDING (server
  // enforces the same rule). Once issued/declined the submission is
  // frozen for the agent and we hide the Edit button.
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [edit, setEdit] = useState({
    carrier: submission.carrier,
    policyType: submission.policyType,
    points: submission.points?.toString() ?? '',
    applicationDate: submission.applicationDate.slice(0, 10),
    clientFirstName: submission.clientFirstName,
    clientLastName: submission.clientLastName,
    clientPhone: submission.clientPhone ?? '',
    clientEmail: submission.clientEmail ?? '',
  })
  const canEdit = submission.status === 'PENDING'

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

  const saveEdit = async () => {
    setEditError(null)
    setSavingEdit(true)
    try {
      const payload: Record<string, unknown> = {
        carrier: edit.carrier,
        policyType: edit.policyType,
        points: edit.points === '' ? null : Number(edit.points),
        applicationDate: edit.applicationDate || null,
        clientFirstName: edit.clientFirstName.trim(),
        clientLastName: edit.clientLastName.trim(),
        clientPhone: edit.clientPhone.trim(),
        clientEmail: edit.clientEmail.trim(),
      }
      const res = await fetch(`/api/agents/new-business/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        setEditError(data.error ?? 'Save failed')
        return
      }
      setEditing(false)
      onChanged()
    } finally { setSavingEdit(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '95vw', height: '100vh', background: '#0F1E33', borderLeft: '1px solid rgba(201,169,110,0.2)', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>{submission.clientFirstName} {submission.clientLastName}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9BB0C4', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatusPill status={submission.status} />
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', borderRadius: 4, padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Edit submission
            </button>
          )}
          {!canEdit && (
            <span style={{ fontSize: 10, color: '#6B8299' }} title="Once a submission moves out of PENDING the agent can't edit it. Reach out to the licensing coordinator if something needs to change.">
              Locked &middot; out of PENDING
            </span>
          )}
        </div>

        {editing ? (
          <div style={{ marginBottom: 14, padding: '14px 16px', background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.18)', borderRadius: 6 }}>
            <div style={{ ...sectionLabel, fontSize: 9 }}>Editing submission</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={fieldLabel}>Carrier</label>
                <select style={inputStyle} value={edit.carrier} onChange={e => setEdit(p => ({ ...p, carrier: e.target.value }))}>
                  {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Policy Type</label>
                <select style={inputStyle} value={edit.policyType} onChange={e => setEdit(p => ({ ...p, policyType: e.target.value }))}>
                  {POLICY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Points</label>
                <input style={inputStyle} type="number" value={edit.points} onChange={e => setEdit(p => ({ ...p, points: e.target.value }))} />
              </div>
              <div>
                <label style={fieldLabel}>Application Date</label>
                <DatePicker value={edit.applicationDate} onChange={v => setEdit(p => ({ ...p, applicationDate: v }))} />
              </div>
              <div>
                <label style={fieldLabel}>Client First Name</label>
                <input style={inputStyle} value={edit.clientFirstName} onChange={e => setEdit(p => ({ ...p, clientFirstName: e.target.value }))} />
              </div>
              <div>
                <label style={fieldLabel}>Client Last Name</label>
                <input style={inputStyle} value={edit.clientLastName} onChange={e => setEdit(p => ({ ...p, clientLastName: e.target.value }))} />
              </div>
              <div>
                <label style={fieldLabel}>Client Phone</label>
                <input
                  type="tel" inputMode="numeric"
                  style={inputStyle}
                  value={edit.clientPhone}
                  onChange={e => setEdit(p => ({ ...p, clientPhone: formatPhoneAsTyped(e.target.value) }))}
                  placeholder="e.g. (555) 123-4567"
                />
              </div>
              <div>
                <label style={fieldLabel}>Client Email</label>
                <input type="email" style={inputStyle} value={edit.clientEmail} onChange={e => setEdit(p => ({ ...p, clientEmail: e.target.value }))} placeholder="client@example.com" />
              </div>
            </div>
            {editError && <div style={{ marginTop: 8, fontSize: 11, color: '#EF4444' }}>{editError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setEditing(false); setEditError(null) }}
                disabled={savingEdit}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: savingEdit ? 'wait' : 'pointer', opacity: savingEdit ? 0.7 : 1 }}
              >
                {savingEdit ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}

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
