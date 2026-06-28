'use client'

import { useEffect, useState, useCallback } from 'react'

const card: React.CSSProperties = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }

type LeadStatus = 'NEW' | 'CONTACTED' | 'BOOKED' | 'NURTURE' | 'WON' | 'DEAD'
type LeadScore = 'A' | 'STANDARD' | 'NURTURE'

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'BOOKED', 'NURTURE', 'WON', 'DEAD']

interface Lead {
  id: string
  createdAt: string
  firstName: string
  lastName: string
  email: string
  phone: string
  ageBand: string
  savingsBand: string
  incomeTiming: string
  priority: string
  accountTypes: string[]
  source: string
  score: LeadScore
  status: LeadStatus
  consentText: string
  consentedAt: string
  ipAddress: string | null
  userAgent: string | null
  pageUrl: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  fbclid: string | null
  referrer: string | null
  ghlContactId: string | null
  notes: string | null
  lastContacted: string | null
}

const scoreBadge = (score: LeadScore): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
  background: score === 'A' ? 'rgba(201,169,110,0.18)' : score === 'NURTURE' ? 'rgba(107,130,153,0.18)' : 'rgba(155,176,196,0.12)',
  color: score === 'A' ? '#E0C088' : '#9BB0C4',
  border: `1px solid ${score === 'A' ? 'rgba(201,169,110,0.4)' : 'rgba(107,130,153,0.3)'}`,
})
const scoreLabel: Record<LeadScore, string> = { A: 'A · CALL FIRST', STANDARD: 'STANDARD', NURTURE: 'NURTURE' }

export default function VaultLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [scoreFilter, setScoreFilter] = useState<string>('')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (scoreFilter) params.set('score', scoreFilter)
    if (q.trim()) params.set('q', q.trim())
    const res = await fetch(`/api/vault/leads?${params.toString()}`)
    if (res.ok) {
      const data = await res.json() as { leads: Lead[]; counts: Record<string, number> }
      setLeads(data.leads)
      setCounts(data.counts ?? {})
    }
    setLoading(false)
  }, [statusFilter, scoreFilter, q])

  useEffect(() => { load() }, [load])

  const updateLead = async (id: string, patch: { status?: LeadStatus; notes?: string }) => {
    const res = await fetch(`/api/vault/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const { lead } = await res.json() as { lead: Lead }
      setLeads(prev => prev.map(l => l.id === id ? { ...l, ...lead } : l))
    }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto', color: '#E6EDF5' }}>
      <div style={sectionLabel}>Ad Leads</div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>Retirement Income Leads</h1>
      <p style={{ fontSize: 13, color: '#9BB0C4', marginBottom: 22 }}>
        Leads from the Meta retirement-income landing page. A-leads ($100k+ and near-term) should be called first.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <input
          placeholder="Search name, email, phone"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 180, padding: '8px 12px', fontSize: 13, background: '#0E1B2E', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6, color: '#E6EDF5' }}
        />
        <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)} style={selStyle}>
          <option value="">All scores</option>
          <option value="A">A (call first)</option>
          <option value="STANDARD">Standard</option>
          <option value="NURTURE">Nurture</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}{counts[s] != null ? ` (${counts[s]})` : ''}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: '#6B8299', fontSize: 13 }}>Loading…</p>
      ) : leads.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#6B8299', fontSize: 14 }}>
          No leads yet. They will appear here the moment the landing page captures one.
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          {leads.map((l, i) => (
            <div key={l.id} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(201,169,110,0.08)' }}>
              <div
                onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                style={{ display: 'grid', gridTemplateColumns: '110px 1.4fr 1.6fr 110px 130px', gap: 12, alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}
              >
                <span style={scoreBadge(l.score)}>{scoreLabel[l.score]}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {l.firstName} {l.lastName}
                    <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6B8299' }}>
                      {l.source === 'meta_instant_form' ? 'Meta form' : 'Landing'}
                    </span>
                  </div>
                  <a href={`tel:${l.phone.replace(/\D/g, '')}`} onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: '#C9A96E', textDecoration: 'none' }}>{l.phone}</a>
                </div>
                <div style={{ fontSize: 12, color: '#9BB0C4' }}>
                  <div>{l.savingsBand} · {l.incomeTiming}</div>
                  <div style={{ color: '#6B8299' }}>{l.ageBand} · {l.priority}</div>
                </div>
                <div style={{ fontSize: 11, color: '#6B8299' }}>{fmtTime(l.createdAt)}</div>
                <select
                  value={l.status}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateLead(l.id, { status: e.target.value as LeadStatus })}
                  style={{ ...selStyle, padding: '6px 8px', fontSize: 12 }}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {expanded === l.id && (
                <div style={{ padding: '4px 16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12 }}>
                  <div>
                    <div style={detailLabel}>Contact</div>
                    <div style={detailVal}>{l.email}</div>
                    <div style={detailVal}>{l.phone}</div>
                    {l.ghlContactId && <div style={{ ...detailVal, color: '#6B8299' }}>GHL contact: {l.ghlContactId}</div>}
                    <div style={{ ...detailLabel, marginTop: 12 }}>Retirement accounts</div>
                    <div style={detailVal}>{l.accountTypes?.length ? l.accountTypes.join(', ') : '—'}</div>
                    <div style={{ ...detailLabel, marginTop: 12 }}>Attribution</div>
                    <div style={detailVal}>{[l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(' / ') || 'Direct / unknown'}</div>
                    {l.fbclid && <div style={{ ...detailVal, color: '#6B8299', wordBreak: 'break-all' }}>fbclid: {l.fbclid}</div>}
                    {l.pageUrl && <div style={{ ...detailVal, color: '#6B8299', wordBreak: 'break-all' }}>{l.pageUrl}</div>}
                  </div>
                  <div>
                    <div style={detailLabel}>TCPA consent record</div>
                    <div style={{ ...detailVal, color: '#9BB0C4' }}>Agreed {new Date(l.consentedAt).toLocaleString()}</div>
                    <div style={{ ...detailVal, color: '#6B8299' }}>IP {l.ipAddress ?? 'n/a'}</div>
                    <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5, marginTop: 6, padding: 10, background: '#0E1B2E', borderRadius: 6, border: '1px solid rgba(201,169,110,0.08)' }}>
                      {l.consentText}
                    </div>
                    <div style={{ ...detailLabel, marginTop: 12 }}>Notes</div>
                    <NotesEditor lead={l} onSave={notes => updateLead(l.id, { notes })} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13, background: '#0E1B2E', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6, color: '#E6EDF5' }
const detailLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }
const detailVal: React.CSSProperties = { fontSize: 12.5, color: '#E6EDF5', marginBottom: 2 }

function NotesEditor({ lead, onSave }: { lead: { notes: string | null }; onSave: (notes: string) => void }) {
  const [val, setVal] = useState(lead.notes ?? '')
  const [dirty, setDirty] = useState(false)
  return (
    <div>
      <textarea
        value={val}
        onChange={e => { setVal(e.target.value); setDirty(true) }}
        rows={3}
        placeholder="Add a follow-up note…"
        style={{ width: '100%', padding: 8, fontSize: 12, background: '#0E1B2E', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6, color: '#E6EDF5', resize: 'vertical' }}
      />
      {dirty && (
        <button
          onClick={() => { onSave(val); setDirty(false) }}
          style={{ marginTop: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, background: 'rgba(201,169,110,0.18)', color: '#E0C088', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 5, cursor: 'pointer' }}
        >
          Save note
        </button>
      )}
    </div>
  )
}
