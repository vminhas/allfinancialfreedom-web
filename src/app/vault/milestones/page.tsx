'use client'

import { useEffect, useState, useCallback } from 'react'
import { MILESTONES, MILESTONE_BY_KEY } from '@/lib/milestones'

const card = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14 }

type Status = 'PENDING_REVIEW' | 'AWARDED' | 'REJECTED'

interface Row {
  id: string
  milestone: string
  status: Status
  requestedAt: string | null
  requestNote: string | null
  reviewedAt: string | null
  reviewNote: string | null
  completedAt: string
  reviewer: { name: string } | null
  agentProfile: {
    id: string
    firstName: string
    lastName: string
    agentCode: string
    phase: number
    discordUserId: string | null
  }
}

export default function VaultMilestonesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  const refresh = useCallback(() => {
    fetch('/api/vault/milestones')
      .then(r => r.ok ? r.json() : { milestones: [] })
      .then((d: { milestones: Row[] }) => { setRows(d.milestones ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const setError = (id: string, msg: string) => setErrorById(p => ({ ...p, [id]: msg }))
  const clearError = (id: string) => setErrorById(p => { const n = { ...p }; delete n[id]; return n })

  const review = async (row: Row, action: 'approve' | 'reject') => {
    setBusyId(row.id); clearError(row.id)
    try {
      let reviewNote: string | undefined
      if (action === 'reject') {
        const note = window.prompt('Optional note for the agent (e.g. "send your AP report"):')
        if (note === null) { setBusyId(null); return }
        reviewNote = note.trim() || undefined
      }
      const res = await fetch(`/api/vault/milestones/${row.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNote }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(row.id, d.error ?? 'Review failed')
      } else {
        refresh()
      }
    } finally { setBusyId(null) }
  }

  const pending = rows.filter(r => r.status === 'PENDING_REVIEW')
  const awarded = rows.filter(r => r.status === 'AWARDED')
  const rejected = rows.filter(r => r.status === 'REJECTED')

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={sectionLabel}>Recognition</div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Milestones
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
          Approve agent-submitted milestones, see exactly what each one requires, and trigger the celebration in Discord with one click.
        </p>
      </div>

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> : (
        <>
          {/* Pending review */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...sectionLabel, color: '#F59E0B', marginBottom: 10 }}>
              Pending review &middot; {pending.length}
            </div>
            {pending.length === 0 ? (
              <div style={{ color: '#4B5563', fontSize: 12 }}>Nothing in the queue.</div>
            ) : (
              <div style={{ ...card, padding: '14px 18px' }}>
                {pending.map(row => (
                  <PendingRow key={row.id} row={row} busy={busyId === row.id} error={errorById[row.id]} onReview={review} />
                ))}
              </div>
            )}
          </div>

          {/* Criteria reference: every submission-typed milestone with its rule */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Submission-type milestones &middot; criteria</div>
            <div style={{ ...card, padding: '14px 18px' }}>
              {MILESTONES.filter(m => m.award === 'submission').map(m => (
                <div key={m.key} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.55 }}>{m.criteria}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recently awarded */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...sectionLabel, color: '#4ADE80', marginBottom: 10 }}>
              Awarded &middot; {awarded.length}
            </div>
            {awarded.length === 0 ? (
              <div style={{ color: '#4B5563', fontSize: 12 }}>None yet.</div>
            ) : (
              <div style={{ ...card, padding: '14px 18px' }}>
                {awarded.slice(0, 30).map(row => (
                  <SimpleRow key={row.id} row={row} accent="#4ADE80" timestampLabel="Awarded" />
                ))}
              </div>
            )}
          </div>

          {/* Rejected (small reference) */}
          {rejected.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...sectionLabel, color: '#EF4444', marginBottom: 10 }}>
                Rejected &middot; {rejected.length}
              </div>
              <div style={{ ...card, padding: '14px 18px' }}>
                {rejected.slice(0, 20).map(row => (
                  <SimpleRow key={row.id} row={row} accent="#EF4444" timestampLabel="Rejected" />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PendingRow({
  row, busy, error, onReview,
}: {
  row: Row
  busy: boolean
  error: string | undefined
  onReview: (row: Row, action: 'approve' | 'reject') => void
}) {
  const def = MILESTONE_BY_KEY[row.milestone]
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
            {row.agentProfile.firstName} {row.agentProfile.lastName}
            <span style={{ color: '#6B8299', fontWeight: 400, marginLeft: 8 }}>
              · {row.agentProfile.agentCode} · Phase {row.agentProfile.phase}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#C9A96E', marginTop: 2 }}>
            {def?.label ?? row.milestone}
          </div>
          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
            Submitted {row.requestedAt ? new Date(row.requestedAt).toLocaleString() : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onReview(row, 'reject')}
            disabled={busy}
            style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', borderRadius: 4, padding: '6px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer' }}
          >Reject</button>
          <button
            onClick={() => onReview(row, 'approve')}
            disabled={busy}
            style={{ background: '#4ADE80', color: '#0A1628', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >{busy ? '...' : 'Approve'}</button>
        </div>
      </div>
      {def?.criteria && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 4, fontSize: 11, color: '#9BB0C4', lineHeight: 1.5 }}>
          <strong style={{ color: '#C9A96E' }}>Criteria:</strong> {def.criteria}
        </div>
      )}
      {row.requestNote && (
        <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, fontSize: 11, color: '#E5E7EB', lineHeight: 1.5 }}>
          <strong style={{ color: '#9BB0C4' }}>Agent&apos;s note:</strong> {row.requestNote}
        </div>
      )}
      {error && <div style={{ marginTop: 6, fontSize: 11, color: '#EF4444' }}>{error}</div>}
    </div>
  )
}

function SimpleRow({ row, accent, timestampLabel }: { row: Row; accent: string; timestampLabel: string }) {
  const def = MILESTONE_BY_KEY[row.milestone]
  const ts = row.reviewedAt ?? row.completedAt
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <span style={{ color: '#fff', fontWeight: 500 }}>
          {row.agentProfile.firstName} {row.agentProfile.lastName}
        </span>
        <span style={{ color: '#9BB0C4', marginLeft: 8 }}>· {def?.label ?? row.milestone}</span>
      </div>
      <div style={{ color: accent, fontSize: 11 }}>
        {timestampLabel} {new Date(ts).toLocaleDateString()}
        {row.reviewer && <span style={{ color: '#6B8299', marginLeft: 6 }}>· {row.reviewer.name}</span>}
      </div>
    </div>
  )
}
