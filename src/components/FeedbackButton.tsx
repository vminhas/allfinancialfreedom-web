'use client'

import { useState } from 'react'
import { MessageSquare, X, Send } from 'lucide-react'

const CATEGORIES = [
  { key: 'general', label: 'General' },
  { key: 'bug', label: 'Bug Report' },
  { key: 'feature', label: 'Feature Request' },
  { key: 'improvement', label: 'Improvement' },
]

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSend = async () => {
    if (!message.trim() || message.trim().length < 5) return
    setSending(true)
    try {
      const res = await fetch('/api/agents/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), category }),
      })
      if (res.ok) {
        setSent(true)
        setMessage('')
        setTimeout(() => { setSent(false); setOpen(false) }, 2000)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 900,
          width: 48, height: 48, borderRadius: '50%',
          background: open ? '#132238' : 'linear-gradient(135deg, #C9A96E 0%, #a8854a 100%)',
          border: open ? '1px solid rgba(201,169,110,0.3)' : 'none',
          boxShadow: open ? 'none' : '0 4px 20px rgba(201,169,110,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        {open
          ? <X size={18} color="#C9A96E" />
          : <MessageSquare size={20} color="#142D48" />
        }
      </button>

      {/* Feedback panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 24, zIndex: 900,
          width: 340, maxWidth: 'calc(100vw - 48px)',
          background: '#132238',
          border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 4 }}>
              Share Your Feedback
            </div>
            <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
              Your feedback helps us build a better platform for everyone on the team.
            </div>
          </div>

          {sent ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: '#4ade80' }}>&#10003;</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 4 }}>Thank you!</div>
              <div style={{ fontSize: 12, color: '#6B8299' }}>Your feedback has been submitted.</div>
            </div>
          ) : (
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: category === c.key ? 'rgba(201,169,110,0.12)' : 'transparent',
                      border: `1px solid ${category === c.key ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      color: category === c.key ? '#C9A96E' : '#6B8299',
                      cursor: 'pointer',
                    }}
                  >{c.label}</button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="What's on your mind? Tell us what would make this better..."
                rows={4}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 13,
                  background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
                  borderRadius: 6, color: '#ffffff', outline: 'none',
                  resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
                  minHeight: 80,
                }}
              />

              <button
                onClick={handleSend}
                disabled={sending || message.trim().length < 5}
                style={{
                  width: '100%', marginTop: 10, padding: '10px 16px',
                  borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: message.trim().length >= 5 ? '#C9A96E' : 'rgba(201,169,110,0.2)',
                  border: 'none', color: '#142D48',
                  cursor: sending || message.trim().length < 5 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: sending ? 0.7 : 1,
                }}
              >
                <Send size={13} />
                {sending ? 'Sending...' : 'Submit Feedback'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
