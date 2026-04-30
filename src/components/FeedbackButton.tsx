'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, X, Send } from 'lucide-react'

const CATEGORIES = [
  { key: 'general', label: 'General' },
  { key: 'bug', label: 'Bug Report' },
  { key: 'feature', label: 'Feature Request' },
  { key: 'improvement', label: 'Improvement' },
  { key: 'licensing', label: 'Licensing' },
]

// The licensing branch routes to /api/agents/coordinator-requests instead of
// the fire-and-forget feedback table — those become tracked tickets the LC
// works in their inbox. Server requires ≥10 chars there vs ≥5 for feedback.
const LICENSING_CATEGORY = 'licensing'
const FEEDBACK_MIN = 5
const LICENSING_MIN = 10

type Status = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'CLOSED'

interface MyFeedbackItem {
  id: string
  category: string
  message: string
  status: Status
  responseToAgent: string | null
  reviewedAt: string | null
  closedAt: string | null
  createdAt: string
}

const STATUS_META: Record<Status, { label: string; color: string }> = {
  OPEN:         { label: 'Submitted',    color: '#F59E0B' },
  ACKNOWLEDGED: { label: 'Reviewed',     color: '#60A5FA' },
  IN_PROGRESS:  { label: 'In progress',  color: '#C9A96E' },
  CLOSED:       { label: 'Resolved',     color: '#4ADE80' },
}

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  // Two views: compose new feedback, or browse past submissions to see
  // where each one landed. "Past" view loads the agent's own history.
  const [view, setView] = useState<'compose' | 'past'>('compose')
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const [history, setHistory] = useState<MyFeedbackItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const isLicensing = category === LICENSING_CATEGORY
  const minLength = isLicensing ? LICENSING_MIN : FEEDBACK_MIN

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    fetch('/api/agents/feedback')
      .then(r => r.ok ? r.json() : { feedback: [] })
      .then((d: { feedback: MyFeedbackItem[] }) => setHistory(d.feedback ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  // Pull history the moment the user switches to the Past tab. Avoids
  // a second fetch on every panel open.
  useEffect(() => {
    if (open && view === 'past') loadHistory()
  }, [open, view, loadHistory])

  const handleSend = async () => {
    if (!message.trim() || message.trim().length < minLength) return
    setSending(true)
    try {
      const res = isLicensing
        ? await fetch('/api/agents/coordinator-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: 'GENERAL', message: message.trim() }),
          })
        : await fetch('/api/agents/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message.trim(), category }),
          })
      if (res.ok) {
        setSent(true)
        setMessage('')
        setTimeout(() => { setSent(false); setOpen(false) }, 2500)
      }
    } finally {
      setSending(false)
    }
  }

  const unresolvedCount = history.filter(h => h.status === 'OPEN' || h.status === 'ACKNOWLEDGED' || h.status === 'IN_PROGRESS').length

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
          width: 360, maxWidth: 'calc(100vw - 48px)',
          background: '#132238',
          border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 20px 0', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <button
                onClick={() => setView('compose')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  background: view === 'compose' ? 'rgba(201,169,110,0.12)' : 'transparent',
                  border: `1px solid ${view === 'compose' ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: view === 'compose' ? '#C9A96E' : '#6B8299',
                  cursor: 'pointer',
                }}
              >
                Send feedback
              </button>
              <button
                onClick={() => setView('past')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  background: view === 'past' ? 'rgba(201,169,110,0.12)' : 'transparent',
                  border: `1px solid ${view === 'past' ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: view === 'past' ? '#C9A96E' : '#6B8299',
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                Your feedback
                {unresolvedCount > 0 && (
                  <span style={{ background: '#C9A96E', color: '#142D48', borderRadius: 999, padding: '0 6px', fontSize: 9 }}>
                    {unresolvedCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {view === 'compose' && (
            <>
              <div style={{ padding: '14px 20px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 4 }}>
                  {isLicensing ? 'Reach Out to Licensing' : 'Share Your Feedback'}
                </div>
                <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
                  {isLicensing
                    ? 'Your message goes straight to the licensing coordinator inbox. Track replies in the Licensing tab.'
                    : 'You\'ll see it land in &quot;Your feedback&quot; and we\'ll DM you on Discord (if connected) when the team reviews it.'}
                </div>
              </div>

              {sent ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8, color: '#4ade80' }}>&#10003;</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 4 }}>
                    {isLicensing ? 'Sent to coordinator' : 'Thank you!'}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B8299' }}>
                    {isLicensing
                      ? 'Open the Licensing tab to follow the conversation.'
                      : 'Tap "Your feedback" to track its status.'}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '14px 20px 16px' }}>
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
                    placeholder={isLicensing
                      ? "What do you need from the licensing coordinator? E.g. exam scheduling, fingerprints, carrier appointments..."
                      : "What's on your mind? Tell us what would make this better..."}
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
                    disabled={sending || message.trim().length < minLength}
                    style={{
                      width: '100%', marginTop: 10, padding: '10px 16px',
                      borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: message.trim().length >= minLength ? '#C9A96E' : 'rgba(201,169,110,0.2)',
                      border: 'none', color: '#142D48',
                      cursor: sending || message.trim().length < minLength ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: sending ? 0.7 : 1,
                    }}
                  >
                    <Send size={13} />
                    {sending
                      ? 'Sending...'
                      : isLicensing ? 'Send to Coordinator' : 'Submit Feedback'}
                  </button>
                </div>
              )}
            </>
          )}

          {view === 'past' && (
            <div style={{ padding: '14px 20px 16px', maxHeight: 420, overflowY: 'auto' }}>
              {historyLoading ? (
                <div style={{ color: '#6B8299', fontSize: 12, textAlign: 'center', padding: 20 }}>Loading...</div>
              ) : history.length === 0 ? (
                <div style={{ color: '#4B5563', fontSize: 12, textAlign: 'center', padding: '24px 12px', lineHeight: 1.6 }}>
                  You haven&apos;t sent any feedback yet. Anything you submit shows up here so you can track where it landed.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {history.map(item => {
                    const meta = STATUS_META[item.status]
                    return (
                      <div key={item.id} style={{
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${meta.color}30`,
                        borderRadius: 6,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                            padding: '2px 7px', borderRadius: 999,
                            background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}40`,
                          }}>
                            {meta.label}
                          </span>
                          <span style={{ fontSize: 9, color: '#6B8299' }}>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: item.responseToAgent ? 8 : 0 }}>
                          {item.message}
                        </div>
                        {item.responseToAgent && (
                          <div style={{
                            padding: '8px 10px', borderRadius: 4,
                            background: 'rgba(74,222,128,0.06)',
                            border: '1px solid rgba(74,222,128,0.2)',
                          }}>
                            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 3 }}>
                              From the team
                            </div>
                            <div style={{ fontSize: 11, color: '#d1d9e2', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                              {item.responseToAgent}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
