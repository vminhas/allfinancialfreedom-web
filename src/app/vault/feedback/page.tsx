'use client'

import { useState, useEffect } from 'react'

interface FeedbackItem {
  id: string
  message: string
  category: string
  read: boolean
  adminNotes: string | null
  createdAt: string
  agentProfile: { firstName: string; lastName: string; agentCode: string; phase: number }
}

const CATEGORY_COLORS: Record<string, string> = {
  general: '#6B8299',
  bug: '#f87171',
  feature: '#60a5fa',
  improvement: '#C9A96E',
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('unread')

  useEffect(() => {
    fetch('/api/vault/feedback')
      .then(r => r.json())
      .then((d: { feedback: FeedbackItem[] }) => { setFeedback(d.feedback ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const markRead = async (id: string, read: boolean) => {
    await fetch('/api/vault/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, read }),
    })
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, read } : f))
  }

  const filtered = filter === 'unread' ? feedback.filter(f => !f.read) : feedback
  const unreadCount = feedback.filter(f => !f.read).length

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0 }}>Agent Feedback</h1>
          <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'} · {feedback.length} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['unread', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: filter === f ? 'rgba(201,169,110,0.12)' : 'transparent',
              border: `1px solid ${filter === f ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: filter === f ? '#C9A96E' : '#6B8299', cursor: 'pointer',
            }}>{f === 'unread' ? `Unread (${unreadCount})` : 'All'}</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px',
            background: '#132238', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 13, color: '#4B5563' }}>
              {filter === 'unread' ? 'No unread feedback.' : 'No feedback submitted yet.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(f => (
              <div key={f.id} style={{
                padding: '16px 20px', borderRadius: 6,
                background: f.read ? 'rgba(255,255,255,0.02)' : '#132238',
                border: `1px solid ${f.read ? 'rgba(255,255,255,0.04)' : 'rgba(201,169,110,0.12)'}`,
                opacity: f.read ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                      {f.agentProfile.firstName} {f.agentProfile.lastName}
                    </span>
                    <span style={{ fontSize: 11, color: '#6B8299', marginLeft: 8 }}>
                      {f.agentProfile.agentCode} · Phase {f.agentProfile.phase}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: CATEGORY_COLORS[f.category] ?? '#6B8299',
                      padding: '2px 8px', borderRadius: 10,
                      background: `${CATEGORY_COLORS[f.category] ?? '#6B8299'}15`,
                    }}>{f.category}</span>
                    <span style={{ fontSize: 10, color: '#4B5563' }}>
                      {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#9BB0C4', lineHeight: 1.6, marginBottom: 10 }}>
                  {f.message}
                </div>
                <button
                  onClick={() => markRead(f.id, !f.read)}
                  style={{
                    background: 'none', border: 'none', fontSize: 10,
                    color: f.read ? '#C9A96E' : '#6B8299', cursor: 'pointer',
                  }}
                >
                  {f.read ? 'Mark unread' : 'Mark as read'}
                </button>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}
