'use client'

import { useEffect, useState, useCallback } from 'react'
import DatePicker from '@/components/DatePicker'

const card = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14 }
const inputStyle = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }
const fieldLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C9A96E', display: 'block', marginBottom: 4 }

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  ISSUED: { bg: 'rgba(74,222,128,0.15)', fg: '#4ADE80' },
  DECLINED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  LAPSED: { bg: 'rgba(107,114,128,0.2)', fg: '#9CA3AF' },
  NOT_TAKEN: { bg: 'rgba(107,114,128,0.2)', fg: '#9CA3AF' },
}
const STATUSES = ['PENDING', 'ISSUED', 'DECLINED', 'LAPSED', 'NOT_TAKEN'] as const
const POLICY_LABEL: Record<string, string> = {
  TERM: 'Term', WHOLE_LIFE: 'Whole Life', IUL: 'IUL', ANNUITY: 'Annuity',
  DISABILITY: 'Disability', LTC: 'LTC', OTHER: 'Other',
}

interface SubmissionListItem {
  id: string
  carrier: string
  policyType: string
  points: number | null
  clientFirstName: string
  clientLastName: string
  status: string
  createdAt: string
  issuedDate: string | null
  agentProfile: { id: string; firstName: string; lastName: string; agentCode: string }
  splitWithAgent: { firstName: string; lastName: string } | null
  assignedTo: { id: string; name: string } | null
  _count: { notes: number }
}

interface SubmissionDetail extends SubmissionListItem {
  applicationDate: string
  policyNumber: string | null
  declinedReason: string | null
  illustrationUrls: string[]
  clientPhone: string | null
  clientEmail: string | null
  clientBirthday: string | null
  clientAddressLine1: string | null
  clientAddressLine2: string | null
  clientCity: string | null
  clientState: string | null
  clientZip: string | null
  notes: {
    id: string
    body: string
    authorType: 'AGENT' | 'ADMIN'
    authorAgent: { firstName: string; lastName: string } | null
    authorAdmin: { name: string } | null
    createdAt: string
  }[]
}

interface Stats { pending: number; issuedThisMonth: number; declinedThisMonth: number; pointsYtd: number }

export default function VaultNewBusinessPage() {
  const [list, setList] = useState<SubmissionListItem[]>([])
  const [stats, setStats] = useState<Stats>({ pending: 0, issuedThisMonth: 0, declinedThisMonth: 0, pointsYtd: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const p = new URLSearchParams()
    if (statusFilter) p.set('status', statusFilter)
    if (search.trim()) p.set('q', search.trim())
    Promise.all([
      fetch(`/api/vault/new-business?${p.toString()}`).then(r => r.ok ? r.json() : { submissions: [] }),
      fetch('/api/vault/new-business/stats').then(r => r.ok ? r.json() : null),
    ]).then(([listRes, statsRes]: [{ submissions: SubmissionListItem[] }, Stats | null]) => {
      setList(listRes.submissions ?? [])
      if (statsRes) setStats(statsRes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [statusFilter, search])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={sectionLabel}>Licensing Coordinator</div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          New Business
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
          Submissions from agents. Update status as you work them in Tevah; notes here are visible to the agent.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard label="Pending" value={stats.pending} accent="#F59E0B" />
        <KpiCard label="Issued This Month" value={stats.issuedThisMonth} accent="#4ADE80" />
        <KpiCard label="Declined This Month" value={stats.declinedThisMonth} accent="#EF4444" />
        <KpiCard label="Points YTD" value={stats.pointsYtd.toLocaleString()} accent="#C9A96E" />
      </div>

      <div style={{ ...card, padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 180 }}>
          <label style={fieldLabel}>Status</label>
          <select style={inputStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={fieldLabel}>Search (client / policy #)</label>
          <input style={inputStyle} value={search} onChange={e => setSearch(e.target.value)} placeholder="Smith, ABC123..." />
        </div>
      </div>

      <div style={{ ...card, padding: '20px 24px' }}>
        {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
          list.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No submissions match.</div> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Agent', 'Client', 'Carrier', 'Type', 'Points', 'Status', 'Submitted', 'Notes'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{s.agentProfile.firstName} {s.agentProfile.lastName}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#fff' }}>{s.clientFirstName} {s.clientLastName}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{s.carrier}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{POLICY_LABEL[s.policyType] ?? s.policyType}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#C9A96E' }}>{s.points ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 11 }}><StatusPill status={s.status} /></td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6B8299' }}>{s._count.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      {openId && <SubmissionDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 300, color: accent, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.PENDING
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {status.replace('_', ' ')}
    </span>
  )
}

function SubmissionDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [editStatus, setEditStatus] = useState<string>('')
  const [issuedDate, setIssuedDate] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [declinedReason, setDeclinedReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/vault/new-business/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { submission: SubmissionDetail } | null) => {
        if (!d) return
        setDetail(d.submission)
        setEditStatus(d.submission.status)
        setIssuedDate(d.submission.issuedDate ? d.submission.issuedDate.slice(0, 10) : '')
        setPolicyNumber(d.submission.policyNumber ?? '')
        setDeclinedReason(d.submission.declinedReason ?? '')
      })
  }, [id])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/vault/new-business/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          issuedDate: issuedDate || null,
          policyNumber: policyNumber || null,
          declinedReason: declinedReason || null,
        }),
      })
      if (res.ok) { load(); onChanged() }
    } finally { setSaving(false) }
  }

  const addNote = async () => {
    if (!noteText.trim()) return
    setPosting(true)
    try {
      const res = await fetch(`/api/vault/new-business/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteText.trim() }),
      })
      if (res.ok) { setNoteText(''); load(); onChanged() }
    } finally { setPosting(false) }
  }

  if (!detail) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '95vw', height: '100vh', background: '#0F1E33', borderLeft: '1px solid rgba(201,169,110,0.2)', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>{detail.clientFirstName} {detail.clientLastName}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9BB0C4', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ marginBottom: 8, fontSize: 12, color: '#9BB0C4' }}>
          Agent: <span style={{ color: '#fff' }}>{detail.agentProfile.firstName} {detail.agentProfile.lastName}</span> · {detail.agentProfile.agentCode}
        </div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ ...sectionLabel, fontSize: 9 }}>Coordinator Updates</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={fieldLabel}>Status</label>
              <select style={inputStyle} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Issued Date</label>
              <DatePicker value={issuedDate} onChange={setIssuedDate} />
            </div>
            <div><label style={fieldLabel}>Policy Number</label><input style={inputStyle} value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} /></div>
            <div><label style={fieldLabel}>Declined Reason</label><input style={inputStyle} value={declinedReason} onChange={e => setDeclinedReason(e.target.value)} /></div>
          </div>
          <button onClick={save} disabled={saving} style={{ marginTop: 12, background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <DetailRow k="Carrier" v={detail.carrier} />
        <DetailRow k="Policy Type" v={POLICY_LABEL[detail.policyType] ?? detail.policyType} />
        <DetailRow k="Points" v={detail.points?.toString() ?? '—'} />
        <DetailRow k="Application Date" v={new Date(detail.applicationDate).toLocaleDateString()} />
        {detail.splitWithAgent && <DetailRow k="Split With" v={`${detail.splitWithAgent.firstName} ${detail.splitWithAgent.lastName}`} />}
        <DetailRow k="Client Phone" v={detail.clientPhone ?? '—'} />
        <DetailRow k="Client Email" v={detail.clientEmail ?? '—'} />
        <DetailRow k="Client Birthday" v={detail.clientBirthday ? new Date(detail.clientBirthday).toLocaleDateString() : '—'} />
        <DetailRow k="Address" v={[detail.clientAddressLine1, detail.clientAddressLine2, detail.clientCity, detail.clientState, detail.clientZip].filter(Boolean).join(', ') || '—'} />

        {detail.illustrationUrls.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...sectionLabel, fontSize: 9 }}>Illustrations</div>
            {detail.illustrationUrls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: '#C9A96E', fontSize: 12, marginBottom: 4 }}>
                Illustration {i + 1} ↗
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div style={{ ...sectionLabel, fontSize: 9 }}>Notes (visible to agent)</div>
          <div style={{ marginBottom: 12 }}>
            {detail.notes.length === 0 && <div style={{ color: '#4B5563', fontSize: 12 }}>No notes yet.</div>}
            {detail.notes.map(n => (
              <div key={n.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, marginBottom: 6, borderLeft: `3px solid ${n.authorType === 'ADMIN' ? '#9B6DFF' : '#C9A96E'}` }}>
                <div style={{ fontSize: 10, color: n.authorType === 'ADMIN' ? '#9B6DFF' : '#C9A96E', fontWeight: 700, marginBottom: 4 }}>
                  {n.authorType === 'ADMIN' ? `Coordinator: ${n.authorAdmin?.name ?? 'Admin'}` : `${n.authorAgent?.firstName ?? 'Agent'} ${n.authorAgent?.lastName ?? ''}`}
                  <span style={{ color: '#6B8299', fontWeight: 400, marginLeft: 8 }}>{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ color: '#E5E7EB', fontSize: 12, whiteSpace: 'pre-wrap' }}>{n.body}</div>
              </div>
            ))}
          </div>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." style={{ ...inputStyle, height: 70, resize: 'vertical' }} />
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
      <div style={{ width: 150, color: '#6B8299' }}>{k}</div>
      <div style={{ color: '#E5E7EB', flex: 1 }}>{v}</div>
    </div>
  )
}
