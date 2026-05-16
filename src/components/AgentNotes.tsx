'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Reusable note thread for an AgentProfile. Drops into the org-tree
// side panel (and any other vault surface that wants it). Reads +
// writes through the existing /api/vault/licensing-agents/[id]/notes
// endpoints so we don't fork the data model.
//
// Real-time refresh: polls every 8s while mounted. The agent-side
// SSE stream at /api/agents/notifications/stream is for agent
// notifications specifically; staff don't currently have an SSE
// channel and standing one up just for note sync isn't worth the
// infra. Polling at 8s is invisible to admins flipping between
// notes on different agents and cheaper than holding open SSE
// connections per staff member.

interface Note {
  id: string
  body: string
  scope: 'LICENSING' | 'ADMIN_ONLY'
  createdAt: string
  updatedAt?: string
  author: { id: string; name: string; role: 'ADMIN' | 'LICENSING_COORDINATOR' }
}

type Role = 'admin' | 'licensing_coordinator'

const POLL_MS = 8000

export default function AgentNotes({
  agentProfileId,
  viewerRole,
  compact = false,
}: {
  agentProfileId: string
  viewerRole: Role | null
  compact?: boolean
}) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState('')
  const [scope, setScope] = useState<'LICENSING' | 'ADMIN_ONLY'>('LICENSING')
  const [posting, setPosting] = useState(false)
  // Inline edit state for an existing note.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // Used to suppress poll-driven flicker while the admin is mid-edit.
  const focused = useRef(false)

  const isAdmin = viewerRole === 'admin'

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/vault/licensing-agents/${agentProfileId}/notes`)
      if (!res.ok) {
        setError(`Couldn't load notes (${res.status})`)
        return
      }
      const d = await res.json() as { notes: Note[] }
      setNotes(d.notes)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load failed')
    }
  }, [agentProfileId])

  useEffect(() => {
    load()
    const t = setInterval(() => {
      // Skip the poll while the admin is typing so the textarea
      // doesn't visually reset / lose caret position. The reload
      // when they stop focusing the box catches it.
      if (focused.current) return
      load()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const submit = async () => {
    const body = composing.trim()
    if (!body) return
    setPosting(true)
    try {
      const res = await fetch(`/api/vault/licensing-agents/${agentProfileId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, scope: isAdmin ? scope : 'LICENSING' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'post failed')
        return
      }
      const d = await res.json() as { note: Note }
      setNotes(prev => prev ? [d.note, ...prev] : [d.note])
      setComposing('')
      setError(null)
    } finally {
      setPosting(false)
    }
  }

  const startEdit = (n: Note) => {
    setEditingId(n.id)
    setEditBody(n.body)
    focused.current = true
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditBody('')
    focused.current = false
  }

  const saveEdit = async (noteId: string) => {
    const body = editBody.trim()
    if (!body) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/vault/licensing-agents/${agentProfileId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, body }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'edit failed')
        return
      }
      const d = await res.json() as { note: Note }
      setNotes(prev => prev ? prev.map(x => x.id === noteId ? d.note : x) : prev)
      setError(null)
      setEditingId(null)
      setEditBody('')
      focused.current = false
    } finally {
      setSavingEdit(false)
    }
  }

  const formatWhen = (iso: string) => {
    const d = new Date(iso)
    const now = Date.now()
    const ms = now - d.getTime()
    if (ms < 60_000) return 'just now'
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', display: 'flex', alignItems: 'center', gap: 8 }}>
        Notes
        {notes && notes.length > 0 && (
          <span style={{ fontSize: 10, color: '#6B8299', letterSpacing: 'normal', textTransform: 'none', fontWeight: 400 }}>
            ({notes.length})
          </span>
        )}
      </div>

      {/* Compose */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        background: '#0C1E30',
        border: '1px solid rgba(201,169,110,0.18)',
        borderRadius: 6, padding: 10,
      }}>
        <textarea
          value={composing}
          onChange={e => setComposing(e.target.value)}
          onFocus={() => { focused.current = true }}
          onBlur={() => { focused.current = false }}
          placeholder="Add an update… ('spoke to Vick today, he wants…')"
          rows={compact ? 2 : 3}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: 'transparent', border: 'none', outline: 'none',
            color: '#d1d9e2', fontSize: 12, fontFamily: 'inherit', lineHeight: 1.5,
            minHeight: 50,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#6B8299' }}>Visible to:</span>
              <button
                type="button"
                onClick={() => setScope(scope === 'LICENSING' ? 'ADMIN_ONLY' : 'LICENSING')}
                style={{
                  padding: '4px 10px', fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: scope === 'ADMIN_ONLY' ? 'rgba(248,113,113,0.12)' : 'rgba(201,169,110,0.12)',
                  color: scope === 'ADMIN_ONLY' ? '#f87171' : '#C9A96E',
                  border: `1px solid ${scope === 'ADMIN_ONLY' ? 'rgba(248,113,113,0.4)' : 'rgba(201,169,110,0.4)'}`,
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                {scope === 'ADMIN_ONLY' ? 'Admins only' : 'Admins + LCs'}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#6B8299' }}>Visible to admins + LCs</div>
          )}
          <button
            onClick={submit}
            disabled={!composing.trim() || posting}
            style={{
              padding: '7px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              background: composing.trim() && !posting ? '#C9A96E' : 'rgba(201,169,110,0.3)',
              color: '#142D48', border: 'none',
              cursor: composing.trim() && !posting ? 'pointer' : 'not-allowed',
            }}
          >
            {posting ? 'Posting…' : 'Post note'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#f87171', padding: '6px 10px', background: 'rgba(248,113,113,0.06)', borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* List */}
      {notes === null ? (
        <div style={{ fontSize: 11, color: '#6B8299' }}>Loading notes…</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 11, color: '#6B8299', fontStyle: 'italic' }}>
          No notes yet. Add the first update.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {notes.map(n => (
            <div key={n.id} style={{
              padding: '10px 12px', borderRadius: 6,
              background: n.scope === 'ADMIN_ONLY' ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${n.scope === 'ADMIN_ONLY' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.05)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
                  {n.author.name}
                  <span style={{ fontSize: 9, color: '#6B8299', fontWeight: 400, marginLeft: 6 }}>
                    {n.author.role === 'LICENSING_COORDINATOR' ? 'LC' : 'Admin'}
                  </span>
                </span>
                <span style={{ fontSize: 10, color: '#6B8299' }} title={new Date(n.createdAt).toLocaleString()}>
                  {formatWhen(n.createdAt)}
                  {n.updatedAt && new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 1000 && (
                    <span style={{ marginLeft: 6, fontStyle: 'italic' }} title={`Edited ${new Date(n.updatedAt).toLocaleString()}`}>· edited</span>
                  )}
                  {n.scope === 'ADMIN_ONLY' && (
                    <span style={{ marginLeft: 6, color: '#f87171', fontWeight: 600 }}>· admins only</span>
                  )}
                </span>
              </div>
              {editingId === n.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    onFocus={() => { focused.current = true }}
                    rows={4}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      background: '#0C1E30', border: '1px solid rgba(201,169,110,0.25)',
                      borderRadius: 4, outline: 'none', padding: 8,
                      color: '#d1d9e2', fontSize: 12, fontFamily: 'inherit', lineHeight: 1.5,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      style={{
                        padding: '6px 12px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        background: 'transparent', color: '#6B8299',
                        border: '1px solid rgba(107,130,153,0.4)', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(n.id)}
                      disabled={!editBody.trim() || savingEdit}
                      style={{
                        padding: '6px 14px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        background: editBody.trim() && !savingEdit ? '#C9A96E' : 'rgba(201,169,110,0.3)',
                        color: '#142D48', border: 'none',
                        cursor: editBody.trim() && !savingEdit ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#d1d9e2', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {n.body}
                  </div>
                  {isAdmin && (
                    <div style={{ marginTop: 6, textAlign: 'right' }}>
                      <button
                        onClick={() => startEdit(n)}
                        style={{
                          padding: '3px 10px', fontSize: 10, fontWeight: 600,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          background: 'transparent', color: '#C9A96E',
                          border: '1px solid rgba(201,169,110,0.35)',
                          borderRadius: 4, cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
