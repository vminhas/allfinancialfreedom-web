'use client'

import { useState, useEffect, useCallback } from 'react'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PARSE_FAILED'

interface IcaSubmission {
  id: string
  status: Status
  createdAt: string
  sourceType: string
  sourceAttachmentUrl: string | null
  pdfFilename: string | null
  parseError: string | null
  firstName: string | null
  middleName: string | null
  lastName: string | null
  email: string | null
  dob: string | null
  gender: string | null
  maritalStatus: string | null
  spouseName: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  referenceCode: string | null
  classification: string | null
  hasLicense: boolean | null
  recruiterName: string | null
  createdAgentProfileId: string | null
}

// Per-row edits. The admin can tune any field before approving, plus
// pick the agentCode. Everything else falls back to whatever the parser
// stored when the form posts.
interface Draft {
  agentCode: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  dob: string
  state: string
  phone: string
  addressLine1: string
  city: string
  zip: string
  recruiterId: string
}

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  PENDING:       { label: 'Pending',       color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  APPROVED:      { label: 'Approved',      color: '#4ADE80', bg: 'rgba(74,222,128,0.10)' },
  REJECTED:      { label: 'Rejected',      color: '#6B8299', bg: 'rgba(107,130,153,0.10)' },
  PARSE_FAILED:  { label: 'Parse failed',  color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
}

export default function RecruitsPage() {
  const [submissions, setSubmissions] = useState<IcaSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Status>('PENDING')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback((status: Status) => {
    setLoading(true)
    fetch(`/api/vault/recruits?status=${status}`)
      .then(r => r.json())
      .then((d: { submissions: IcaSubmission[] }) => { setSubmissions(d.submissions ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load(filter) }, [load, filter])

  // Seed the draft state from the parsed values when a row first renders.
  // Storing in state lets the admin edit free-form before approval.
  const draftFor = (s: IcaSubmission): Draft => drafts[s.id] ?? {
    agentCode: '',
    firstName: s.firstName ?? '',
    middleName: s.middleName ?? '',
    lastName: s.lastName ?? '',
    email: s.email ?? '',
    dob: s.dob ?? '',
    state: s.state ?? '',
    phone: '',
    addressLine1: s.addressLine1 ?? '',
    city: s.city ?? '',
    zip: s.zip ?? '',
    recruiterId: s.referenceCode ?? '',
  }

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts(d => ({ ...d, [id]: { ...draftFor(submissions.find(s => s.id === id)!), ...d[id], ...patch } }))
  }

  const approve = async (s: IcaSubmission, force = false) => {
    const draft = draftFor(s)
    if (!draft.agentCode.trim() || !draft.firstName.trim() || !draft.lastName.trim() || !draft.email.trim()) {
      setErr('Agent code, first name, last name, and email are required.')
      return
    }
    setErr(null)
    setSavingId(s.id)
    try {
      const res = await fetch(`/api/vault/recruits/${s.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, force }),
      })
      const data = await res.json() as { error?: string; duplicate?: { agentCode: string; firstName: string; lastName: string } }
      if (res.status === 409 && data.duplicate && !force) {
        // Same-name duplicate — confirm with the admin and resubmit with force=true.
        const dup = data.duplicate
        const ok = window.confirm(
          `An agent named ${dup.firstName} ${dup.lastName} (${dup.agentCode}) already exists. ` +
          `If this is a DIFFERENT person with the same name, click OK to create anyway. ` +
          `Otherwise click Cancel and reject this submission as a duplicate.`,
        )
        if (ok) {
          setSavingId(null)
          await approve(s, true)
        }
        return
      }
      if (!res.ok) {
        setErr(data.error ?? `Approve failed (${res.status})`)
        return
      }
      load(filter)
    } finally {
      setSavingId(null)
    }
  }

  const reject = async (s: IcaSubmission) => {
    const note = window.prompt('Reason for rejecting this ICA? (optional)')
    if (note === null) return // cancelled
    setSavingId(s.id)
    try {
      const res = await fetch(`/api/vault/recruits/${s.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErr(data.error ?? `Reject failed (${res.status})`)
        return
      }
      load(filter)
    } finally {
      setSavingId(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    color: '#E8EEF4',
    padding: '6px 8px',
    fontSize: 12,
    width: '100%',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10, color: '#6B8299', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.6 }

  return (
    <div style={{ padding: '24px 32px', color: '#E8EEF4', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Recruit Pipeline</h1>
      <p style={{ fontSize: 13, color: '#9BB0C4', marginBottom: 20 }}>
        ICAs dropped into the admin Discord channel are parsed automatically and queued here.
        Review the extracted fields, pick an agent code, and approve to create the AgentProfile + fire
        the NEW RECRUIT announcement.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(Object.keys(STATUS_META) as Status[]).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
              background: filter === s ? STATUS_META[s].bg : 'transparent',
              color: filter === s ? STATUS_META[s].color : '#9BB0C4',
              border: `1px solid ${filter === s ? STATUS_META[s].color : 'rgba(255,255,255,0.10)'}`,
            }}
          >
            {STATUS_META[s].label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ padding: 12, marginBottom: 16, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', borderRadius: 4, color: '#f87171', fontSize: 13 }}>
          {err}
        </div>
      )}

      {loading && <div style={{ color: '#6B8299' }}>Loading...</div>}
      {!loading && submissions.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#6B8299', border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 4 }}>
          No {STATUS_META[filter].label.toLowerCase()} submissions.
        </div>
      )}

      {!loading && submissions.map(s => {
        const draft = draftFor(s)
        const isPending = s.status === 'PENDING'
        return (
          <div key={s.id} style={{ marginBottom: 16, padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {s.firstName ?? '—'} {s.lastName ?? ''}
              </div>
              <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, background: STATUS_META[s.status].bg, color: STATUS_META[s.status].color, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {STATUS_META[s.status].label}
              </span>
              <span style={{ fontSize: 11, color: '#6B8299' }}>
                {new Date(s.createdAt).toLocaleString()}
              </span>
              {s.sourceAttachmentUrl && (
                <a href={s.sourceAttachmentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'underline' }}>
                  {s.pdfFilename ?? 'Original PDF'}
                </a>
              )}
              {s.recruiterName && (
                <span style={{ fontSize: 11, color: '#9BB0C4' }}>
                  Recruited by <strong>{s.recruiterName}</strong> ({s.referenceCode})
                </span>
              )}
            </div>

            {s.parseError && (
              <div style={{ padding: 10, marginBottom: 12, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 4, color: '#f87171', fontSize: 12 }}>
                Parse error: {s.parseError}
              </div>
            )}

            {isPending && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={labelStyle}>Agent Code *</label>
                    <input style={inputStyle} value={draft.agentCode} onChange={e => setDraft(s.id, { agentCode: e.target.value })} placeholder="F0000" />
                  </div>
                  <div>
                    <label style={labelStyle}>First Name *</label>
                    <input style={inputStyle} value={draft.firstName} onChange={e => setDraft(s.id, { firstName: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Middle</label>
                    <input style={inputStyle} value={draft.middleName} onChange={e => setDraft(s.id, { middleName: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Last Name *</label>
                    <input style={inputStyle} value={draft.lastName} onChange={e => setDraft(s.id, { lastName: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={labelStyle}>Email *</label>
                    <input style={inputStyle} value={draft.email} onChange={e => setDraft(s.id, { email: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>DOB</label>
                    <input style={inputStyle} value={draft.dob} onChange={e => setDraft(s.id, { dob: e.target.value })} placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input style={inputStyle} value={draft.phone} onChange={e => setDraft(s.id, { phone: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>State</label>
                    <input style={inputStyle} value={draft.state} onChange={e => setDraft(s.id, { state: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Address</label>
                    <input style={inputStyle} value={draft.addressLine1} onChange={e => setDraft(s.id, { addressLine1: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>City</label>
                    <input style={inputStyle} value={draft.city} onChange={e => setDraft(s.id, { city: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>ZIP</label>
                    <input style={inputStyle} value={draft.zip} onChange={e => setDraft(s.id, { zip: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Recruiter Code</label>
                    <input style={inputStyle} value={draft.recruiterId} onChange={e => setDraft(s.id, { recruiterId: e.target.value })} placeholder="F0000" />
                  </div>
                </div>
              </>
            )}

            {!isPending && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12, color: '#9BB0C4' }}>
                <div><strong style={{ color: '#E8EEF4' }}>Email:</strong> {s.email ?? '—'}</div>
                <div><strong style={{ color: '#E8EEF4' }}>State:</strong> {s.state ?? '—'}</div>
                <div><strong style={{ color: '#E8EEF4' }}>DOB:</strong> {s.dob ?? '—'}</div>
                <div><strong style={{ color: '#E8EEF4' }}>Address:</strong> {s.addressLine1 ?? '—'}</div>
                <div><strong style={{ color: '#E8EEF4' }}>City / ZIP:</strong> {[s.city, s.zip].filter(Boolean).join(' ') || '—'}</div>
                <div><strong style={{ color: '#E8EEF4' }}>Classification:</strong> {s.classification ?? '—'}</div>
              </div>
            )}

            {isPending && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => approve(s)}
                  disabled={savingId === s.id}
                  style={{
                    padding: '8px 14px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    background: '#4ADE80', color: '#0B1014', border: 'none', fontWeight: 600,
                    opacity: savingId === s.id ? 0.5 : 1,
                  }}
                >
                  {savingId === s.id ? 'Approving...' : 'Approve & announce'}
                </button>
                <button
                  onClick={() => reject(s)}
                  disabled={savingId === s.id}
                  style={{
                    padding: '8px 14px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    background: 'transparent', color: '#9BB0C4', border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
