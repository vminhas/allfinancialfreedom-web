'use client'

import { useState, useEffect, useCallback } from 'react'

type Status = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'CLOSED'

interface FeedbackItem {
  id: string
  message: string
  category: string
  status: Status
  responseToAgent: string | null
  adminNotes: string | null
  reviewedAt: string | null
  closedAt: string | null
  createdAt: string
  agentProfile: { firstName: string; lastName: string; agentCode: string; phase: number }
}

const CATEGORY_COLORS: Record<string, string> = {
  general: '#6B8299',
  bug: '#f87171',
  feature: '#60a5fa',
  improvement: '#C9A96E',
}

// Workflow visualization. Order matters - drives chip order + display.
const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  OPEN:         { label: 'Open',         color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: '#60A5FA', bg: 'rgba(96,165,250,0.10)' },
  IN_PROGRESS:  { label: 'In progress',  color: '#C9A96E', bg: 'rgba(201,169,110,0.10)' },
  CLOSED:       { label: 'Closed',       color: '#4ADE80', bg: 'rgba(74,222,128,0.10)' },
}

const STATUS_ORDER: Status[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CLOSED']

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'all' | Status>('open')
  // Track per-row pending edits so the textarea/select can be edited
  // before saving. Empty drafts mean "no change."
  const [drafts, setDrafts] = useState<Record<string, { status?: Status; responseToAgent?: string; adminNotes?: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/vault/feedback')
      .then(r => r.json())
      .then((d: { feedback: FeedbackItem[] }) => { setFeedback(d.feedback ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (id: string) => {
    const draft = drafts[id]
    if (!draft) return
    const item = feedback.find(f => f.id === id)
    if (!item) return

    // Guard rail: closing requires a response so the agent never sees a
    // ghosted-close. Skip if no status change to CLOSED.
    if (draft.status === 'CLOSED' && item.status !== 'CLOSED') {
      const finalResponse = draft.responseToAgent ?? item.responseToAgent ?? ''
      if (finalResponse.trim().length === 0) {
        alert('Add a short response to the agent before closing. They\'ll see it as part of their feedback panel.')
        return
      }
    }

    setSavingId(id)
    try {
      const res = await fetch('/api/vault/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      if (res.ok) {
        const d = await res.json() as { feedback: FeedbackItem }
        setFeedback(prev => prev.map(f => f.id === id ? { ...f, ...d.feedback } : f))
        setDrafts(prev => { const next = { ...prev }; delete next[id]; return next })
      }
    } finally {
      setSavingId(null)
    }
  }

  const updateDraft = (id: string, patch: Partial<{ status: Status; responseToAgent: string; adminNotes: string }>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const filtered = filter === 'all'
    ? feedback
    : filter === 'open'
      ? feedback.filter(f => f.status === 'OPEN' || f.status === 'ACKNOWLEDGED' || f.status === 'IN_PROGRESS')
      : feedback.filter(f => f.status === filter)

  // Counts per status drive the filter chip badges so the admin knows
  // what's queued without expanding any section.
  const countsByStatus = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = feedback.filter(f => f.status === s).length
    return acc
  }, {} as Record<Status, number>)
  const openCount = countsByStatus.OPEN + countsByStatus.ACKNOWLEDGED + countsByStatus.IN_PROGRESS

  const filterChips: Array<{ key: typeof filter; label: string; count: number; color?: string }> = [
    { key: 'open',         label: 'Active',       count: openCount,                color: '#C9A96E' },
    { key: 'OPEN',         label: 'New',          count: countsByStatus.OPEN,          color: STATUS_META.OPEN.color },
    { key: 'ACKNOWLEDGED', label: 'Acknowledged', count: countsByStatus.ACKNOWLEDGED,  color: STATUS_META.ACKNOWLEDGED.color },
    { key: 'IN_PROGRESS',  label: 'In progress',  count: countsByStatus.IN_PROGRESS,   color: STATUS_META.IN_PROGRESS.color },
    { key: 'CLOSED',       label: 'Closed',       count: countsByStatus.CLOSED,        color: STATUS_META.CLOSED.color },
    { key: 'all',          label: 'All',          count: feedback.length },
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0 }}>Agent Feedback</h1>
        <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
          Move items through the workflow as you process them. Agents see the status + your response on their own portal,
          and get a Discord DM (if connected) when something changes. Closing an item requires a short response so nobody
          feels ghosted.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {filterChips.map(chip => {
          const active = filter === chip.key
          const c = chip.color ?? '#6B8299'
          return (
            <button
              key={String(chip.key)}
              onClick={() => setFilter(chip.key)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: active ? `${c}22` : 'transparent',
                border: `1px solid ${active ? c : 'rgba(255,255,255,0.08)'}`,
                color: active ? c : '#9BB0C4',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {chip.label}
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: active ? c : '#6B8299',
                background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                padding: '0 6px', borderRadius: 999,
              }}>
                {chip.count}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px',
            background: '#132238', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 13, color: '#4B5563' }}>
              No feedback in this view.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(f => {
              const draft = drafts[f.id]
              const draftStatus = draft?.status ?? f.status
              const draftResponse = draft?.responseToAgent ?? f.responseToAgent ?? ''
              const draftNotes = draft?.adminNotes ?? f.adminNotes ?? ''
              const dirty = !!draft && (
                draft.status !== undefined ||
                (draft.responseToAgent !== undefined && draft.responseToAgent !== (f.responseToAgent ?? '')) ||
                (draft.adminNotes !== undefined && draft.adminNotes !== (f.adminNotes ?? ''))
              )
              const meta = STATUS_META[draftStatus]

              return (
                <div key={f.id} style={{
                  padding: '18px 22px', borderRadius: 8,
                  background: '#132238',
                  border: `1px solid ${meta.color}25`,
                }}>
                  {/* Header: agent identity on top; pills + date below
                      so they wrap independently. On narrow viewports
                      the long agent name + a couple of pills + a
                      date used to overflow off the right edge -- now
                      everything wraps cleanly to additional lines. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                        {f.agentProfile.firstName} {f.agentProfile.lastName}
                      </span>
                      <span style={{ fontSize: 11, color: '#6B8299' }}>
                        {f.agentProfile.agentCode} &middot; Phase {f.agentProfile.phase}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                        color: CATEGORY_COLORS[f.category] ?? '#6B8299',
                        padding: '2px 8px', borderRadius: 10,
                        background: `${CATEGORY_COLORS[f.category] ?? '#6B8299'}15`,
                        whiteSpace: 'nowrap',
                      }}>{f.category}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '3px 9px', borderRadius: 999,
                        background: meta.bg, color: meta.color,
                        border: `1px solid ${meta.color}55`,
                        whiteSpace: 'nowrap',
                      }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 10, color: '#4B5563', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                        {new Date(f.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  {/* Original message */}
                  <div style={{ fontSize: 13, color: '#d1d9e2', lineHeight: 1.6, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
                    {f.message}
                  </div>

                  {/* Workflow controls. grid-template-columns minmax with
                      auto-fit lets the two columns sit side-by-side on
                      desktop but stack on narrow viewports when the
                      response textarea would otherwise be squeezed. */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12, alignItems: 'flex-start',
                  }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
                        Status
                      </div>
                      <select
                        value={draftStatus}
                        onChange={e => updateDraft(f.id, { status: e.target.value as Status })}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: '#0A1628', border: `1px solid ${meta.color}40`,
                          borderRadius: 4, color: meta.color,
                          padding: '8px 10px', fontSize: 12, fontWeight: 700,
                        }}
                      >
                        {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                      {f.reviewedAt && (
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6 }}>
                          Reviewed {new Date(f.reviewedAt).toLocaleDateString()}
                        </div>
                      )}
                      {f.closedAt && (
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                          Closed {new Date(f.closedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
                        Response to agent (visible)
                      </div>
                      <textarea
                        value={draftResponse}
                        onChange={e => updateDraft(f.id, { responseToAgent: e.target.value })}
                        rows={2}
                        placeholder="What should the agent know? Even a one-liner makes them feel heard."
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                          borderRadius: 4, color: '#d1d9e2',
                          padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                        }}
                      />
                    </div>
                  </div>

                  {/* Admin-only notes - collapsed by default */}
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 10, color: '#6B8299', cursor: 'pointer', userSelect: 'none' }}>
                      Internal notes (admin-only)
                    </summary>
                    <textarea
                      value={draftNotes}
                      onChange={e => updateDraft(f.id, { adminNotes: e.target.value })}
                      rows={2}
                      placeholder="Anything the team needs to know that isn&apos;t for the agent."
                      style={{
                        width: '100%', boxSizing: 'border-box', marginTop: 6,
                        background: '#0A1628', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 4, color: '#9BB0C4',
                        padding: '8px 10px', fontSize: 11, fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />
                  </details>

                  {/* Save */}
                  {dirty && (
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        onClick={() => setDrafts(prev => { const next = { ...prev }; delete next[f.id]; return next })}
                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Discard
                      </button>
                      <button
                        onClick={() => save(f.id)}
                        disabled={savingId === f.id}
                        style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: savingId === f.id ? 'wait' : 'pointer' }}
                      >
                        {savingId === f.id ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}
