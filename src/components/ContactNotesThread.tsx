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
  const [error, setError] = useState('')

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
    setError('')
    try {
      const res = await fetch(withPT(`/api/agents/partners/${partnerId}/notes`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.trim() }),
      })
      if (res.ok) {
        const d = await res.json() as { note: Note }
        setNotes(prev => [...(prev ?? []), d.note])
        setDraft('')
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? `Failed (${res.status})`)
      }
    } catch {
      setError('Network error')
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
      alert(d.error ?? 'Edit failed.')
    }
    setEditSaving(false)
  }

  const deleteNote = async (noteId: string) => {
    setNotes(prev => (prev ?? []).filter(n => n.id !== noteId))
    await fetch(withPT(`/api/agents/partners/${partnerId}/notes?noteId=${noteId}`), { method: 'DELETE' })
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(201,169,110,0.1)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#C9A96E', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
        Notes
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postNote() } }}
          placeholder="Add a note..."
          style={{
            flex: 1, padding: '6px 10px',
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#d1d9e2', fontSize: 11,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={postNote}
          disabled={sending || !draft.trim()}
          style={{
            background: draft.trim() ? '#C9A96E' : 'rgba(201,169,110,0.3)',
            color: '#142D48', border: 'none', borderRadius: 4,
            padding: '6px 12px', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: sending || !draft.trim() ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {sending ? '...' : 'Add'}
        </button>
      </div>
      {error && <div style={{ fontSize: 10, color: '#f87171', marginBottom: 6 }}>{error}</div>}

      {notes === null ? (
        <div style={{ fontSize: 10, color: '#6B8299' }}>Loading...</div>
      ) : notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
          {notes.map(n => {
            const roleColor = ROLE_COLORS[n.authorRole] ?? '#6B8299'
            const isEditing = editingId === n.id
            const elapsed = Date.now() - new Date(n.createdAt).getTime()
            const canStillEdit = n.canEdit && elapsed < EDIT_WINDOW_MS

            return (
              <div key={n.id} style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } }}
                      style={{
                        flex: 1, padding: '4px 8px',
                        background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                        borderRadius: 3, color: '#d1d9e2', fontSize: 11, fontFamily: 'inherit',
                      }}
                    />
                    <button onClick={saveEdit} disabled={editSaving} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: 'pointer' }}>
                      {editSaving ? '...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: roleColor, fontSize: 10 }}>{n.authorName}</span>
                      <span style={{ fontSize: 8, color: roleColor, marginLeft: 4, opacity: 0.7 }}>{ROLE_LABELS[n.authorRole] ?? n.authorRole}</span>
                      <span style={{ color: '#4B5563', margin: '0 5px' }}>&middot;</span>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{n.message}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, color: '#4B5563' }}>
                        {timeAgo(n.createdAt)}{n.editedAt && ' (edited)'}
                      </span>
                      {canStillEdit && (
                        <button
                          onClick={() => { setEditingId(n.id); setEditDraft(n.message) }}
                          style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 9, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >Edit</button>
                      )}
                      <button
                        onClick={() => deleteNote(n.id)}
                        style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 9, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >Remove</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
