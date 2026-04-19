'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface Announcement {
  id: string; title: string; message: string; createdAt: string
}

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    fetch('/api/agents/announcements')
      .then(r => r.ok ? r.json() : { announcements: [] })
      .then((d: { announcements: Announcement[] }) => setAnnouncements(d.announcements ?? []))
      .catch(() => {})
  }, [])

  const dismiss = async (id: string) => {
    setAnnouncements(prev => prev.filter(a => a.id !== id))
    await fetch('/api/agents/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcementId: id }),
    })
  }

  if (announcements.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {announcements.map(a => (
        <div key={a.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '14px 18px', borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(201,169,110,0.08) 0%, rgba(201,169,110,0.03) 100%)',
          border: '1px solid rgba(201,169,110,0.2)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#C9A96E', marginBottom: 4 }}>
              {a.title}
            </div>
            <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>
              {a.message}
            </div>
          </div>
          <button
            onClick={() => dismiss(a.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, flexShrink: 0, marginTop: -2,
            }}
          >
            <X size={14} color="#6B8299" />
          </button>
        </div>
      ))}
    </div>
  )
}
