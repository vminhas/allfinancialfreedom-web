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
  reviewedAt: string | null
  closedAt: string | null
  createdAt: string
  screenshotUrls?: string[]
}

const MAX_SCREENSHOTS = 4

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
  // Screenshot upload state. URLs are filled in as each upload completes;
  // submit-side ships them to /api/agents/feedback alongside the message.
  // Per-file uploadingCount lets the UI disable the picker while uploads
  // are mid-flight without blocking the rest of the form.
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [history, setHistory] = useState<MyFeedbackItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Which history row is expanded into the threaded conversation view.
  // Only one can be open at a time so the panel stays scannable.
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const handleUploadScreenshots = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    const remaining = MAX_SCREENSHOTS - screenshotUrls.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (toUpload.length === 0) {
      setUploadError(`Max ${MAX_SCREENSHOTS} screenshots per ticket.`)
      return
    }
    setUploadingCount(c => c + toUpload.length)
    for (const file of toUpload) {
      try {
        const fd = new FormData()
        fd.append('screenshot', file)
        const res = await fetch('/api/agents/feedback/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(d.error ?? `Upload failed (${res.status})`)
        }
        const { url } = await res.json() as { url: string }
        setScreenshotUrls(prev => [...prev, url])
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.')
      } finally {
        setUploadingCount(c => c - 1)
      }
    }
  }

  const removeScreenshot = (url: string) => {
    setScreenshotUrls(prev => prev.filter(u => u !== url))
  }

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
            body: JSON.stringify({ message: message.trim(), category, screenshotUrls }),
          })
      if (res.ok) {
        setSent(true)
        setMessage('')
        setScreenshotUrls([])
        setUploadError(null)
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

                  {/* Screenshot picker, suppressed in the licensing flow
                      because that path posts to coordinator-requests not
                      feedback (different table, different fields). */}
                  {!isLicensing && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <label style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '5px 10px', borderRadius: 4,
                          background: 'rgba(201,169,110,0.06)',
                          border: '1px solid rgba(201,169,110,0.2)',
                          color: screenshotUrls.length >= MAX_SCREENSHOTS ? '#4B5563' : '#C9A96E',
                          fontSize: 10, fontWeight: 600,
                          cursor: screenshotUrls.length >= MAX_SCREENSHOTS ? 'not-allowed' : 'pointer',
                        }}>
                          📎 {uploadingCount > 0 ? 'Uploading...' : 'Attach screenshot'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            multiple
                            disabled={screenshotUrls.length >= MAX_SCREENSHOTS}
                            onChange={e => {
                              handleUploadScreenshots(e.target.files)
                              e.target.value = ''
                            }}
                            style={{ display: 'none' }}
                          />
                        </label>
                        <span style={{ fontSize: 10, color: '#6B8299' }}>
                          {screenshotUrls.length}/{MAX_SCREENSHOTS} attached &middot; PNG, JPG, WebP, or GIF up to 5 MB
                        </span>
                      </div>
                      {uploadError && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5' }}>{uploadError}</div>
                      )}
                      {screenshotUrls.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {screenshotUrls.map(url => (
                            <div key={url} style={{ position: 'relative' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="screenshot" style={{
                                width: 60, height: 60, objectFit: 'cover',
                                borderRadius: 4, border: '1px solid rgba(201,169,110,0.25)',
                              }} />
                              <button
                                type="button"
                                onClick={() => removeScreenshot(url)}
                                title="Remove"
                                style={{
                                  position: 'absolute', top: -6, right: -6,
                                  width: 18, height: 18, borderRadius: '50%',
                                  background: '#0A1628', border: '1px solid rgba(248,113,113,0.5)',
                                  color: '#f87171', fontSize: 11, lineHeight: 1,
                                  cursor: 'pointer', padding: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleSend}
                    disabled={sending || uploadingCount > 0 || message.trim().length < minLength}
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
                    const isOpen = expandedId === item.id
                    return (
                      <div key={item.id} style={{
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${meta.color}30`,
                        borderRadius: 6,
                      }}>
                        <button
                          onClick={() => setExpandedId(isOpen ? null : item.id)}
                          style={{
                            background: 'transparent', border: 'none', padding: 0,
                            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                          }}
                        >
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
                              <span style={{ marginLeft: 8, color: '#C9A96E' }}>{isOpen ? '▾' : '▸'}</span>
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {item.message}
                          </div>
                          {item.screenshotUrls && item.screenshotUrls.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {item.screenshotUrls.map(url => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={url}
                                  src={url}
                                  alt="screenshot"
                                  onClick={e => { e.stopPropagation(); window.open(url, '_blank', 'noopener,noreferrer') }}
                                  style={{
                                    width: 56, height: 56, objectFit: 'cover',
                                    borderRadius: 4, border: '1px solid rgba(201,169,110,0.25)',
                                    cursor: 'zoom-in',
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </button>
                        {isOpen && (
                          <div style={{ marginTop: 10 }}>
                            <AgentFeedbackThread feedbackId={item.id} />
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

// ─── Agent-side threaded conversation ──────────────────────────────────
// Pulls non-internal notes only (the admin-side endpoint exposes
// internal notes; this one filters them out) and lets the agent post
// clarification questions or follow-ups. Posting fires an admin
// activity Discord ping server-side, so the team sees replies without
// polling /vault/feedback.

interface ThreadNote {
  id: string
  body: string
  createdAt: string
  authorAdmin: { id: string; name: string } | null
  authorAgentProfile: { id: string; firstName: string; lastName: string } | null
}

function AgentFeedbackThread({ feedbackId }: { feedbackId: string }) {
  const [notes, setNotes] = useState<ThreadNote[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/agents/feedback/${feedbackId}/notes`)
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
      const res = await fetch(`/api/agents/feedback/${feedbackId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (res.ok) { setDraft(''); load() }
    } finally { setPosting(false) }
  }

  return (
    <div>
      {loading ? (
        <div style={{ fontSize: 11, color: '#6B8299' }}>Loading...</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 11, color: '#6B8299', fontStyle: 'italic', padding: '4px 0 8px' }}>
          No replies yet. Drop a follow-up below if you have a clarification.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notes.map(n => {
            const isAgent = !!n.authorAgentProfile
            const author = n.authorAdmin
              ? `${n.authorAdmin.name} · the team`
              : isAgent
                ? 'You'
                : 'Legacy entry'
            return (
              <div key={n.id} style={{
                padding: '8px 10px', borderRadius: 4,
                background: isAgent ? 'rgba(96,165,250,0.06)' : 'rgba(74,222,128,0.06)',
                border: `1px solid ${isAgent ? 'rgba(96,165,250,0.2)' : 'rgba(74,222,128,0.2)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: isAgent ? '#60A5FA' : '#4ade80' }}>
                    {author}
                  </span>
                  <span style={{ fontSize: 9, color: '#6B8299' }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#d1d9e2', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {n.body}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Composer */}
      <div style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, border: '1px solid rgba(201,169,110,0.15)' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a clarification or follow-up..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'transparent', border: 'none', outline: 'none',
            color: '#d1d9e2', fontSize: 11, fontFamily: 'inherit', resize: 'vertical',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post() }
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={post}
            disabled={posting || draft.trim().length === 0}
            style={{
              background: '#C9A96E', color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              cursor: posting || draft.trim().length === 0 ? 'not-allowed' : 'pointer',
              opacity: posting || draft.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {posting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
