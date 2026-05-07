'use client'

import { useState, useEffect, useCallback } from 'react'

type Status = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'CLOSED'

interface FeedbackItem {
  id: string
  message: string
  category: string
  status: Status
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
  // Track per-row pending status edits so the admin can pick a status
  // and Save in one shot. Notes/replies post immediately via the
  // /notes endpoint and are not part of this draft state.
  const [drafts, setDrafts] = useState<Record<string, { status?: Status }>>({})
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

    // Guard rail: closing without a single visible note on file
    // would leave the agent feeling ghosted.
    if (draft.status === 'CLOSED' && item.status !== 'CLOSED') {
      let hasVisibleNote = false
      try {
        const r = await fetch(`/api/vault/feedback/${id}/notes`)
        if (r.ok) {
          const d = await r.json() as { notes: Array<{ isInternal: boolean }> }
          hasVisibleNote = d.notes.some(n => !n.isInternal)
        }
      } catch { /* fall through to alert */ }
      if (!hasVisibleNote) {
        alert('Post a short reply to the agent before closing. They\'ll see it on their feedback panel.')
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

  const updateDraft = (id: string, patch: Partial<{ status: Status }>) => {
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
              const dirty = !!draft && draft.status !== undefined && draft.status !== f.status
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

                  {/* Status select — flips fire on Save (still a draft
                      flow) so an admin can stage status moves
                      thoughtfully. Replies and internal notes live
                      below in the thread; those post immediately. */}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
                      Status
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={draftStatus}
                        onChange={e => updateDraft(f.id, { status: e.target.value as Status })}
                        style={{
                          background: '#0A1628', border: `1px solid ${meta.color}40`,
                          borderRadius: 4, color: meta.color,
                          padding: '8px 10px', fontSize: 12, fontWeight: 700,
                          minWidth: 160,
                        }}
                      >
                        {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                      {f.reviewedAt && (
                        <span style={{ fontSize: 10, color: '#6B8299' }}>
                          Reviewed {new Date(f.reviewedAt).toLocaleDateString()}
                        </span>
                      )}
                      {f.closedAt && (
                        <span style={{ fontSize: 10, color: '#6B8299' }}>
                          Closed {new Date(f.closedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Threaded conversation: agent replies + admin
                      visible posts + internal-only context, all in
                      chronological order. Internal posts have a
                      muted background + "Internal" badge. */}
                  <FeedbackThread feedbackId={f.id} mode="admin" />

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

// ─── Threaded notes ────────────────────────────────────────────────────
// Renders a chronological conversation on a single feedback ticket and
// a composer to add new replies. `mode="admin"` shows internal notes
// inline (with a muted style + badge) and exposes a "Mark as internal"
// toggle on the composer. The agent-side variant lives separately
// (FeedbackButton.tsx) since it has different access rules.

interface ThreadNote {
  id: string
  body: string
  isInternal: boolean
  createdAt: string
  authorAdmin: { id: string; name: string } | null
  authorAgentProfile: { id: string; firstName: string; lastName: string; agentCode?: string } | null
}

function FeedbackThread({ feedbackId, mode }: { feedbackId: string; mode: 'admin' }) {
  const [notes, setNotes] = useState<ThreadNote[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [internal, setInternal] = useState(false)
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/vault/feedback/${feedbackId}/notes`)
      .then(r => r.ok ? r.json() : { notes: [] })
      .then((d: { notes: ThreadNote[] }) => { setNotes(d.notes ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [feedbackId])

  useEffect(() => { load() }, [load])

  const post = async () => {
    const body = draft.trim()
    if (!body) return
    setPosting(true)
    try {
      const res = await fetch(`/api/vault/feedback/${feedbackId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, isInternal: internal }),
      })
      if (res.ok) {
        setDraft('')
        setInternal(false)
        load()
      }
    } finally { setPosting(false) }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
        Conversation
      </div>
      {loading ? (
        <div style={{ fontSize: 11, color: '#6B8299' }}>Loading thread...</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 11, color: '#6B8299', fontStyle: 'italic', padding: '6px 0' }}>
          No replies yet. Drop a note below to start the conversation.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(n => {
            const author = n.authorAdmin
              ? n.authorAdmin.name
              : n.authorAgentProfile
                ? `${n.authorAgentProfile.firstName} ${n.authorAgentProfile.lastName}`
                : 'Legacy entry'
            const isAgentAuthor = !!n.authorAgentProfile
            return (
              <div key={n.id} style={{
                padding: '10px 12px', borderRadius: 6,
                background: n.isInternal
                  ? 'rgba(255,255,255,0.03)'
                  : isAgentAuthor
                    ? 'rgba(96,165,250,0.06)'
                    : 'rgba(201,169,110,0.06)',
                border: `1px solid ${n.isInternal ? 'rgba(255,255,255,0.06)' : isAgentAuthor ? 'rgba(96,165,250,0.18)' : 'rgba(201,169,110,0.18)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isAgentAuthor ? '#60A5FA' : '#C9A96E' }}>{author}</span>
                  {n.isInternal && (
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: '#6B8299', background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 3 }}>
                      INTERNAL
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#6B8299', marginLeft: 'auto' }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: n.isInternal ? '#9BB0C4' : '#d1d9e2', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {n.body}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Composer */}
      <div style={{ marginTop: 10, padding: 10, background: '#0A1628', borderRadius: 6, border: '1px solid rgba(201,169,110,0.15)' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          placeholder={internal ? 'Internal note for the team...' : 'Reply to the agent...'}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'transparent', border: 'none', outline: 'none',
            color: '#d1d9e2', fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
          }}
          // Cmd/Ctrl+Enter posts so admins can shoot quick replies without
          // reaching for the mouse.
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post() }
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          {mode === 'admin' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#9BB0C4', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={internal}
                onChange={e => setInternal(e.target.checked)}
                style={{ accentColor: '#C9A96E' }}
              />
              Internal only (not visible to agent)
            </label>
          )}
          <button
            onClick={post}
            disabled={posting || draft.trim().length === 0}
            style={{
              marginLeft: 'auto',
              background: internal ? 'rgba(255,255,255,0.06)' : '#C9A96E',
              color: internal ? '#9BB0C4' : '#142D48',
              border: 'none', borderRadius: 4,
              padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              cursor: posting || draft.trim().length === 0 ? 'not-allowed' : 'pointer',
              opacity: posting || draft.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {posting ? 'Posting...' : internal ? 'Add internal note' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}
