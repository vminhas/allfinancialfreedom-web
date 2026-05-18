'use client'

import { useState, useEffect, useCallback } from 'react'

interface Note {
  id: string
  authorRole: string
  authorName: string
  authorId: string
  message: string
  editedAt: string | null
  createdAt: string
  canEdit: boolean
}

const EDIT_WINDOW_MS = 5 * 60 * 1000

const ROLE_COLORS: Record<string, string> = {
  agent: '#60a5fa',
  admin: '#C9A96E',
  licensing_coordinator: '#9B6DFF',
}

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  admin: 'Admin',
  licensing_coordinator: 'LC',
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ContactNotesThread({ partnerId, previewToken }: { partnerId: string; previewToken?: string | null }) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const withPT = (url: string) => previewToken ? `${url}${url.includes('?') ? '&' : '?'}preview=${encodeURIComponent(previewToken)}` : url

  const load = useCallback(() => {
    fetch(withPT(`/api/agents/partners/${partnerId}/notes`))
      .then(r => r.ok ? r.json() : { notes: [] })
      .then((d: { notes: Note[] }) => setNotes(d.notes ?? []))
      .catch(() => setNotes([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, previewToken])

  useEffect(() => { load() }, [load])

  const postNote = async () => {
    if (!draft.trim()) return
    setSending(true)
    const res = await fetch(withPT(`/api/agents/partners/${partnerId}/notes`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: draft.trim() }),
    })
    if (res.ok) {
      const d = await res.json() as { note: Note }
      setNotes(prev => [...(prev ?? []), d.note])
      setDraft('')
    }
    setSending(false)
  }

  const saveEdit = async () => {
    if (!editingId || !editDraft.trim()) return
    setEditSaving(true)
    const res = await fetch(withPT(`/api/agents/partners/${partnerId}/notes`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: editingId, message: editDraft.trim() }),
    })
    if (res.ok) {
      const d = await res.json() as { note: Note }
      setNotes(prev => (prev ?? []).map(n => n.id === editingId ? d.note : n))
      setEditingId(null)
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string }
      alert(d.error ?? 'Edit failed — the 5-minute window may have expired.')
    }
    setEditSaving(false)
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(201,169,110,0.1)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#C9A96E', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
        Notes & History
      </div>

      {/* Add note */}
      <div style={{ marginBottom: 12, padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a note..."
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px',
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#d1d9e2', fontSize: 11,
            fontFamily: 'inherit', resize: 'vertical', minHeight: 48,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={postNote}
            disabled={sending || !draft.trim()}
            style={{
              background: draft.trim() ? '#C9A96E' : 'rgba(201,169,110,0.3)',
              color: '#142D48', border: 'none', borderRadius: 4,
              padding: '6px 14px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Saving...' : '+ Add Note'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {notes === null ? (
        <div style={{ fontSize: 11, color: '#6B8299' }}>Loading...</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 11, color: '#4B5563', padding: '8px 0' }}>No notes yet.</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 18, maxHeight: 300, overflowY: 'auto' }}>
          {/* Vertical timeline line */}
          <div style={{
            position: 'absolute', left: 5, top: 4, bottom: 4,
            width: 2, background: 'linear-gradient(180deg, rgba(201,169,110,0.3), rgba(201,169,110,0.05))',
            borderRadius: 1,
          }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map(n => {
              const roleColor = ROLE_COLORS[n.authorRole] ?? '#6B8299'
              const isEditing = editingId === n.id
              const elapsed = Date.now() - new Date(n.createdAt).getTime()
              const canStillEdit = n.canEdit && elapsed < EDIT_WINDOW_MS

              return (
                <div key={n.id} style={{ position: 'relative' }}>
                  {/* Timeline dot */}
                  <div style={{
                    position: 'absolute', left: -15, top: 10,
                    width: 8, height: 8, borderRadius: '50%',
                    background: roleColor,
                    border: '2px solid #132238',
                    boxShadow: `0 0 0 2px ${roleColor}33`,
                  }} />

                  <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${roleColor}20`,
                    borderRadius: 6, padding: '8px 10px',
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 6, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: roleColor }}>{n.authorName}</span>
                        <span style={{
                          fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                          padding: '1px 5px', borderRadius: 3,
                          background: `${roleColor}14`, color: roleColor, border: `1px solid ${roleColor}30`,
                        }}>
                          {ROLE_LABELS[n.authorRole] ?? n.authorRole}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, color: '#4B5563' }}>
                          {timeAgo(n.createdAt)}
                          {n.editedAt && ' (edited)'}
                        </span>
                        {canStillEdit && !isEditing && (
                          <button
                            onClick={() => { setEditingId(n.id); setEditDraft(n.message) }}
                            style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 9, cursor: 'pointer', textDecoration: 'underline' }}
                          >Edit</button>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    {isEditing ? (
                      <div>
                        <textarea
                          value={editDraft}
                          onChange={e => setEditDraft(e.target.value)}
                          rows={2}
                          style={{
                            width: '100%', boxSizing: 'border-box', padding: '6px 8px',
                            background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                            borderRadius: 4, color: '#d1d9e2', fontSize: 11,
                            fontFamily: 'inherit', resize: 'vertical',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          <button onClick={saveEdit} disabled={editSaving} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: 'pointer' }}>
                            {editSaving ? '...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.message}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
