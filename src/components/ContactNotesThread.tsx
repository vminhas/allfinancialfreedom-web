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

const ROLE_COLORS: Record<string, string> = {
  agent: '#60a5fa',
  admin: '#C9A96E',
  licensing_coordinator: '#9B6DFF',
}

export default function ContactNotesThread({ partnerId, previewToken }: { partnerId: string; previewToken?: string | null }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMessage, setEditMessage] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const url = (path: string) => previewToken ? `${path}${path.includes('?') ? '&' : '?'}preview=${encodeURIComponent(previewToken)}` : path

  const loadNotes = useCallback(() => {
    fetch(url(`/api/agents/partners/${partnerId}/notes`))
      .then(r => r.ok ? r.json() : { notes: [] })
      .then((d: { notes: Note[] }) => setNotes(d.notes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [partnerId, previewToken])

  useEffect(() => { loadNotes() }, [loadNotes])

  const postNote = async () => {
    if (!newMessage.trim()) return
    setSending(true)
    const res = await fetch(url(`/api/agents/partners/${partnerId}/notes`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: newMessage.trim() }),
    })
    if (res.ok) {
      const d = await res.json() as { note: Note }
      setNotes(prev => [...prev, d.note])
      setNewMessage('')
    }
    setSending(false)
  }

  const saveEdit = async () => {
    if (!editingId || !editMessage.trim()) return
    setEditSaving(true)
    const res = await fetch(url(`/api/agents/partners/${partnerId}/notes`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: editingId, message: editMessage.trim() }),
    })
    if (res.ok) {
      const d = await res.json() as { note: Note }
      setNotes(prev => prev.map(n => n.id === editingId ? d.note : n))
      setEditingId(null)
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string }
      alert(d.error ?? 'Edit failed')
    }
    setEditSaving(false)
  }

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    if (diffMs < 60_000) return 'just now'
    if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`
    if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(201,169,110,0.1)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#C9A96E', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
        Notes & History
      </div>

      {loading ? (
        <div style={{ fontSize: 10, color: '#4B5563' }}>Loading...</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 8 }}>No notes yet. Start the conversation.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, maxHeight: 240, overflowY: 'auto' }}>
          {notes.map(n => {
            const roleColor = ROLE_COLORS[n.authorRole] ?? '#6B8299'
            const isEditing = editingId === n.id

            return (
              <div key={n.id} style={{
                padding: '8px 10px', borderRadius: 4,
                background: 'rgba(255,255,255,0.02)',
                borderLeft: `2px solid ${roleColor}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: roleColor }}>{n.authorName}</span>
                    <span style={{ fontSize: 8, color: '#4B5563', textTransform: 'uppercase', fontWeight: 600 }}>{n.authorRole === 'agent' ? 'Agent' : 'Trainer'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, color: '#4B5563' }}>
                      {fmtTime(n.createdAt)}
                      {n.editedAt && ' (edited)'}
                    </span>
                    {n.canEdit && !isEditing && (
                      <button
                        onClick={() => { setEditingId(n.id); setEditMessage(n.message) }}
                        style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 9, cursor: 'pointer' }}
                      >Edit</button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div>
                    <textarea
                      value={editMessage}
                      onChange={e => setEditMessage(e.target.value)}
                      rows={2}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '4px 6px',
                        background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                        borderRadius: 3, color: '#d1d9e2', fontSize: 11, fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                      <button onClick={saveEdit} disabled={editSaving} style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: 'pointer' }}>
                        {editSaving ? '...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.message}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New note input */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postNote() } }}
          placeholder="Add a note..."
          style={{
            flex: 1, padding: '6px 8px', fontSize: 11,
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#d1d9e2', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={postNote}
          disabled={sending || !newMessage.trim()}
          style={{
            padding: '6px 12px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: newMessage.trim() ? '#C9A96E' : 'rgba(201,169,110,0.2)',
            border: 'none', color: '#142D48',
            cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? '...' : 'Post'}
        </button>
      </div>
    </div>
  )
}
