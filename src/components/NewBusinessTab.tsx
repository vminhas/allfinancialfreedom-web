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
  const [minPhase, setMinPhase] = useState(4)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const refresh = useCallback(() => {
    fetch('/api/agents/new-business')
      .then(r => r.ok ? r.json() : null)
      .then((d: { submissions: Submission[]; locked?: boolean; minPhase?: number } | null) => {
        if (d?.submissions) setSubmissions(d.submissions)
        if (typeof d?.locked === 'boolean') setLocked(d.locked)
        if (typeof d?.minPhase === 'number') setMinPhase(d.minPhase)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Phase-locked agents still see this view — they may have shared
  // submissions where they're the split agent on a colleague's
  // policy. The lock only prevents CREATION (the + Submit button is
  // greyed below), not viewing or commenting on policies they're
  // explicitly invited to.
  const isPhaseLocked = locked || phase < minPhase

  const opened = submissions.find(s => s.id === openId) ?? null

  // Split into "my submissions" (writer) and "shared with me" (split agent)
  // lanes so an agent can tell at a glance which policies are theirs to
  // edit vs which they're collaborating on.
  const ownSubmissions    = submissions.filter(s => (s as Submission & { lane?: string }).lane !== 'shared')
  const sharedSubmissions = submissions.filter(s => (s as Submission & { lane?: string }).lane === 'shared')

  // Filter the table based on the pill selection
  const applyFilter = (list: Submission[]) => list.filter(s => {
    if (filter === 'pending') return s.status === 'PENDING'
    if (filter === 'clients') return s.status === 'ISSUED'
    return true
  })
  const filtered = applyFilter(ownSubmissions)

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
        <div style={sectionLabel}>New Business ({ownSubmissions.length})</div>
        {isPhaseLocked ? (
          // Phase-locked: greyed-but-visible button + tooltip explaining
          // the unlock. Page itself is still rendered so the agent can
          // see the "Shared with me" lane below if they're a split
          // agent on a colleague's policy.
          <div style={{ position: 'relative' }}>
            <button
              disabled
              title={`Unlocks at Phase ${minPhase}`}
              style={{
                background: 'rgba(201,169,110,0.15)',
                color: 'rgba(201,169,110,0.5)',
                border: '1px dashed rgba(201,169,110,0.35)',
                borderRadius: 4, padding: '6px 14px',
                fontSize: 11, fontWeight: 700, cursor: 'not-allowed',
              }}
            >
              + Submit New Business
            </button>
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', fontSize: 10, color: '#6B8299', whiteSpace: 'nowrap' }}>
              Unlocks at Phase {minPhase}
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(s => !s)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {showForm ? 'Cancel' : '+ Submit New Business'}
          </button>
        )}
      </div>

      {isPhaseLocked && sharedSubmissions.length === 0 && ownSubmissions.length === 0 && (
        <div style={{ ...card, padding: '32px 24px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(201,169,110,0.2)' }}>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>New Business &middot; Locked</div>
          <div style={{ color: '#9BB0C4', fontSize: 13, marginBottom: 4 }}>
            Unlocks at Phase {minPhase} (Marketing Director track).
          </div>
          <div style={{ color: '#6B8299', fontSize: 12 }}>
            Once you reach Phase {minPhase} you can submit new business. If a teammate adds you as a split agent on their policy, it'll show up here regardless of phase.
          </div>
        </div>
      )}

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
            {(['Client', 'Carrier', 'Type', 'Target Premium', 'Status', 'Submitted', ...(showAnniversaryCol ? ['Next Anniversary'] : [])]).map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{s.clientFirstName} {s.clientLastName}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{s.carrier}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{POLICY_TYPES.find(p => p.value === s.policyType)?.label ?? s.policyType}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#C9A96E' }}>{s.points != null ? `$${s.points.toLocaleString()}` : '—'}</td>
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

      {/* Shared with me — policies where the agent is the split agent.
          Always rendered when there are any, regardless of phase. */}
      {sharedSubmissions.length > 0 && (
        <>
          <div style={{ ...sectionLabel, marginTop: 28, marginBottom: 12 }}>
            Shared with me ({sharedSubmissions.length})
          </div>
          <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 12, lineHeight: 1.5 }}>
            Policies where a teammate added you as a split agent. You can view + comment regardless of your phase.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Client', 'Carrier', 'Type', 'Writer', 'Status', 'Submitted'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {applyFilter(sharedSubmissions).map(s => {
                const writer = (s as Submission & { agentProfile?: { firstName: string; lastName: string; agentCode: string } | null }).agentProfile
                return (
                  <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{s.clientFirstName} {s.clientLastName}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{s.carrier}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{POLICY_TYPES.find(p => p.value === s.policyType)?.label ?? s.policyType}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>
                      {writer ? <>{writer.firstName} {writer.lastName} <span style={{ color: '#4B5563' }}>· {writer.agentCode}</span></> : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11 }}><StatusPill status={s.status} /></td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

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

interface SplitAgentCandidate {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  avatarUrl: string | null
}

function NewBusinessForm({ isMobile, onSaved }: { isMobile: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    applicationDate: '', carrier: '', policyType: 'TERM', points: '',
    splitWithAgentId: '',
    clientFirstName: '', clientLastName: '', clientPhone: '', clientEmail: '', clientBirthday: '',
    clientAddressLine1: '', clientAddressLine2: '', clientCity: '', clientState: '', clientZip: '',
  })
  const [splitQuery, setSplitQuery] = useState('')
  const [splitResults, setSplitResults] = useState<SplitAgentCandidate[]>([])
  const [splitSelected, setSplitSelected] = useState<SplitAgentCandidate | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced agent search for the picker. Three+ chars triggers
  // /api/agents/new-business/agent-search; results render in the
  // dropdown below the input. Selecting locks splitWithAgentId on
  // the form payload and closes the dropdown.
  useEffect(() => {
    if (splitSelected) return
    const q = splitQuery.trim()
    if (q.length < 2) { setSplitResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/agents/new-business/agent-search?q=${encodeURIComponent(q)}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { agents: SplitAgentCandidate[] } | null) => {
          if (d?.agents) setSplitResults(d.agents)
        })
        .catch(() => { /* non-fatal */ })
    }, 200)
    return () => clearTimeout(t)
  }, [splitQuery, splitSelected])

  const pickSplit = (a: SplitAgentCandidate) => {
    setSplitSelected(a)
    setSplitOpen(false)
    setSplitQuery(`${a.firstName} ${a.lastName} (${a.agentCode})`)
    setForm(f => ({ ...f, splitWithAgentId: a.id }))
  }
  const clearSplit = () => {
    setSplitSelected(null)
    setSplitQuery('')
    setForm(f => ({ ...f, splitWithAgentId: '' }))
  }

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
        <div><label style={fieldLabel}>Target Premium</label><input type="number" step="0.01" placeholder="e.g. 1200" style={inputStyle} value={form.points} onChange={e => setForm(f => ({ ...f, points: e.target.value }))} /></div>
      </div>

      {/* Split-agent picker. Optional. When set, the chosen agent
          gets read + comment access on this submission regardless of
          their own phase, and is pinged via the unified notifications
          channel ("you were added as split agent on X's policy").
          Search activates after 2 chars; click a result to lock it
          in, click ✕ to unset. */}
      <div style={{ marginTop: 14 }}>
        <label style={fieldLabel}>Split with (optional)</label>
        <div style={{ position: 'relative' }}>
          <input
            style={inputStyle}
            value={splitQuery}
            onChange={e => {
              setSplitQuery(e.target.value)
              if (splitSelected) {
                // Editing after select clears the lock so user can
                // pick a different agent.
                setSplitSelected(null)
                setForm(f => ({ ...f, splitWithAgentId: '' }))
              }
              setSplitOpen(true)
            }}
            onFocus={() => setSplitOpen(true)}
            onBlur={() => { setTimeout(() => setSplitOpen(false), 150) }}
            placeholder="Type a colleague's name or agent code"
          />
          {splitSelected && (
            <button
              type="button"
              onClick={clearSplit}
              aria-label="Clear split agent"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#6B8299', fontSize: 14, cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
          {splitOpen && !splitSelected && splitResults.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: '#0F1E33', border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 4, zIndex: 10,
              maxHeight: 240, overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {splitResults.map(a => (
                <div
                  key={a.id}
                  onMouseDown={(e) => { e.preventDefault(); pickSplit(a) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: a.avatarUrl ? 'transparent' : 'rgba(201,169,110,0.15)',
                    border: '1px solid rgba(201,169,110,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    fontSize: 9, color: '#C9A96E', fontWeight: 700,
                  }}>
                    {a.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : `${a.firstName[0] ?? ''}${a.lastName[0] ?? ''}`}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#fff' }}>{a.firstName} {a.lastName}</div>
                    <div style={{ fontSize: 10, color: '#6B8299' }}>{a.agentCode} · Phase {a.phase}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
          They&apos;ll be able to see and comment on this policy from their own portal regardless of their phase. We&apos;ll DM them on Discord and send an in-app notification.
        </div>
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
  // Live updates: when the unified notifications stream pushes a
  // policy.comment event whose subjectId matches THIS submission,
  // refetch so the new note appears in the thread without the agent
  // having to close + reopen the drawer. NotificationCenter rebroadcasts
  // every received notification as a window 'aff-notification' event.
  useEffect(() => {
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        { kind?: string; subjectType?: string; subjectId?: string } | undefined
      if (!detail) return
      const isCommentForMe =
        detail.kind === 'policy.comment' &&
        detail.subjectType === 'new_business' &&
        detail.subjectId === submission.id
      if (isCommentForMe) onChanged()
    }
    window.addEventListener('aff-notification', onLive)
    return () => window.removeEventListener('aff-notification', onLive)
  }, [submission.id, onChanged])

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
  // DECLINED is terminal so the agent can't edit; everything else is fair
  // game so they can fix typos even after the policy was issued. Server
  // mirrors this rule and pings the admin channel when a non-PENDING row
  // is edited, so the LC isn't surprised.
  const canEdit = submission.status !== 'DECLINED'

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MuteToggle submission={submission} onChanged={onChanged} />
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9BB0C4', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
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
            <span style={{ fontSize: 10, color: '#6B8299' }} title="Declined submissions are frozen. Reach out to your licensing coordinator if something needs to change.">
              Locked &middot; declined
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
                <label style={fieldLabel}>Target Premium</label>
                <input style={inputStyle} type="number" step="0.01" placeholder="e.g. 1200" value={edit.points} onChange={e => setEdit(p => ({ ...p, points: e.target.value }))} />
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
            <DetailRow k="Target Premium" v={submission.points != null ? `$${submission.points.toLocaleString()}` : '—'} />
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

// Per-policy mute toggle. Lives in the drawer header next to the
// close button. When muted, suppress Discord DMs about new comments
// on this submission only — the in-app row + bell-icon ping still
// fire so the agent catches up next time they're in-portal.
//
// Optimistic state: the toggle flips immediately, the API call
// runs in the background. If it fails we revert. Reload via
// onChanged() so the parent submission list reflects the new
// state (used by the icon's filled vs hollow rendering on next
// drawer open).
function MuteToggle({ submission, onChanged }: { submission: Submission & { muted?: boolean }; onChanged: () => void }) {
  const [muted, setMuted] = useState(!!submission.muted)
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)
    const next = !muted
    setMuted(next)  // optimistic
    try {
      const res = await fetch(`/api/agents/new-business/${submission.id}/mute`, {
        method: next ? 'POST' : 'DELETE',
      })
      if (!res.ok) throw new Error(`${res.status}`)
      onChanged()
    } catch {
      setMuted(!next)  // revert
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={toggle}
      title={muted
        ? "Muted — Discord DMs on new comments suppressed. In-app notifications still arrive."
        : "Mute Discord DMs for this policy. Bell-icon notifications still arrive."}
      aria-label={muted ? 'Unmute Discord DMs for this policy' : 'Mute Discord DMs for this policy'}
      disabled={pending}
      style={{
        background: muted ? 'rgba(248,113,113,0.10)' : 'transparent',
        border: muted ? '1px solid rgba(248,113,113,0.35)' : '1px solid rgba(255,255,255,0.08)',
        color: muted ? '#f87171' : '#9BB0C4',
        borderRadius: 4, padding: '4px 8px', fontSize: 12, lineHeight: 1, cursor: pending ? 'wait' : 'pointer',
      }}
    >
      {muted ? '🔕' : '🔔'}
    </button>
  )
}
