'use client'

import { useState, useEffect } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface Announcement {
  id: string; title: string; message: string; targetPhase: number | null
  active: boolean; expiresAt: string | null; createdBy: string | null
  createdAt: string; _count: { reads: number }
}

export default function AnnouncementsPage() {
  const isMobile = useIsMobile()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', targetPhase: '', expiresAt: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/announcements').then(r => r.json())
      .then((d: { announcements: Announcement[] }) => { setAnnouncements(d.announcements ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    setSaving(true)
    await fetch('/api/admin/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title, message: form.message,
        targetPhase: form.targetPhase ? parseInt(form.targetPhase) : undefined,
        expiresAt: form.expiresAt || undefined,
      }),
    })
    setForm({ title: '', message: '', targetPhase: '', expiresAt: '' })
    setShowForm(false)
    setSaving(false)
    const res = await fetch('/api/admin/announcements')
    const d = await res.json() as { announcements: Announcement[] }
    setAnnouncements(d.announcements ?? [])
  }

  const toggleActive = async (id: string, active: boolean) => {
    await fetch('/api/admin/announcements', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    })
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, active } : a))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement? This cannot be undone.')) return
    await fetch(`/api/admin/announcements?id=${id}`, { method: 'DELETE' })
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', outline: 'none' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }

  return (
    <div style={{ padding: isMobile ? 16 : '24px 32px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0 }}>Announcements</h1>
          <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>Send messages to agents. They appear as banners in the portal until dismissed or expired.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New</button>
      </div>

      {showForm && (
        <div style={{ padding: 20, marginBottom: 16, background: '#132238', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}>
              <div style={lbl}>Title *</div>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inp} placeholder="e.g., New Training Schedule" />
            </div>
            <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}>
              <div style={lbl}>Message *</div>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} placeholder="What do you want agents to know?" />
            </div>
            <div>
              <div style={lbl}>Target Phase (optional)</div>
              <select value={form.targetPhase} onChange={e => setForm(f => ({ ...f, targetPhase: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">All agents</option>
                {[1,2,3,4,5].map(p => <option key={p} value={p}>Phase {p} only</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Expires (optional)</div>
              <input type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 4, fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleCreate} disabled={saving || !form.title || !form.message} style={{ padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Sending...' : 'Publish'}</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: '#6B8299' }}>Loading...</div> :
        announcements.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: 32 }}>No announcements yet.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {announcements.map(a => {
            const isExpired = a.expiresAt && new Date(a.expiresAt) < new Date()
            return (
              <div key={a.id} style={{
                padding: '14px 18px', borderRadius: 6,
                background: '#132238', border: `1px solid ${a.active && !isExpired ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)'}`,
                opacity: a.active && !isExpired ? 1 : 0.6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>{a.title}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {a.active && !isExpired && <span style={{ fontSize: 8, fontWeight: 700, color: '#4ade80', padding: '2px 8px', background: 'rgba(74,222,128,0.1)', borderRadius: 10, textTransform: 'uppercase' }}>Live</span>}
                    {isExpired && <span style={{ fontSize: 8, fontWeight: 700, color: '#f87171', padding: '2px 8px', background: 'rgba(248,113,113,0.1)', borderRadius: 10, textTransform: 'uppercase' }}>Expired</span>}
                    {!a.active && !isExpired && <span style={{ fontSize: 8, fontWeight: 700, color: '#6B8299', padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, textTransform: 'uppercase' }}>Paused</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6, marginBottom: 8 }}>{a.message}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#4B5563' }}>
                  <div>
                    {a.targetPhase ? `Phase ${a.targetPhase} only` : 'All agents'} · {a._count.reads} read · {new Date(a.createdAt).toLocaleDateString()}
                    {a.expiresAt && ` · Expires ${new Date(a.expiresAt).toLocaleDateString()}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleActive(a.id, !a.active)} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 10, cursor: 'pointer' }}>{a.active ? 'Pause' : 'Resume'}</button>
                    <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 10, cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      }
    </div>
  )
}
