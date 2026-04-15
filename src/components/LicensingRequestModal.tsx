'use client'

import { useEffect, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

export type LicensingRequestTopic =
  | 'SCHEDULE_EXAM'
  | 'PASS_POST_LICENSING'
  | 'FINGERPRINTS_APPLY'
  | 'GFI_APPOINTMENTS'
  | 'CE_COURSES'
  | 'EO_INSURANCE'
  | 'DIRECT_DEPOSIT'
  | 'UNDERWRITING'
  | 'GENERAL'

export const TOPIC_LABELS: Record<LicensingRequestTopic, string> = {
  SCHEDULE_EXAM: 'Schedule my licensing exam',
  PASS_POST_LICENSING: 'Post-licensing call (I just passed)',
  FINGERPRINTS_APPLY: 'Fingerprints & state application',
  GFI_APPOINTMENTS: 'Submit to GFI / carrier appointments',
  CE_COURSES: 'CE courses (AML, Annuity, Ethics)',
  EO_INSURANCE: 'E&O insurance',
  DIRECT_DEPOSIT: 'Direct deposit setup',
  UNDERWRITING: 'Underwriting question',
  GENERAL: 'Something else',
}

interface CallItem {
  id: string
  phaseItemKey?: string | null
  topic: LicensingRequestTopic
  message: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface LicensingRequestModalProps {
  phaseItemKey: string
  phaseItemLabel: string
  defaultTopic: LicensingRequestTopic
  existingRequests: CallItem[]
  onClose: () => void
  onSubmitted: (newRequest: CallItem) => void
}

export default function LicensingRequestModal({
  phaseItemKey,
  phaseItemLabel,
  defaultTopic,
  existingRequests,
  onClose,
  onSubmitted,
}: LicensingRequestModalProps) {
  const isMobile = useIsMobile()
  const [topic, setTopic] = useState<LicensingRequestTopic>(defaultTopic)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [justSent, setJustSent] = useState<CallItem | null>(null)

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/agents/coordinator-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseItemKey, topic, message }),
      })
      const data = await res.json() as { request?: CallItem; error?: string }
      if (!res.ok || !data.request) {
        setError(data.error ?? 'Failed to send request')
        setSubmitting(false)
        return
      }
      setJustSent(data.request)
      onSubmitted(data.request)
      setMessage('')
      setSubmitting(false)
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 80,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: isMobile ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: isMobile ? 0 : 16,
    backdropFilter: 'blur(3px)',
  }

  const modalStyle: React.CSSProperties = {
    background: '#132238',
    border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: isMobile ? '16px 16px 0 0' : 12,
    width: isMobile ? '100%' : 'min(520px, 100vw)',
    maxHeight: isMobile ? '92vh' : '90vh',
    overflowY: 'auto',
    boxShadow: '0 -24px 80px rgba(0,0,0,0.55)',
    WebkitOverflowScrolling: 'touch',
  }

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: '#C9A96E',
    marginBottom: 6,
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0A1628',
    border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#d1d9e2',
    padding: '10px 12px', fontSize: 13,
    fontFamily: 'inherit',
  }

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{
          padding: isMobile ? '18px 20px 14px' : '22px 28px 16px',
          borderBottom: '1px solid rgba(201,169,110,0.1)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          position: 'sticky', top: 0, background: '#132238', zIndex: 2,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              Licensing Coordinator
            </div>
            <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 500, color: '#ffffff', lineHeight: 1.25 }}>
              Request help
            </div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
              About: {phaseItemLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 6, width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#C9A96E', fontSize: 18, lineHeight: 1, flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: isMobile ? '18px 20px 20px' : '22px 28px 24px' }}>
          {/* Existing requests */}
          {existingRequests.length > 0 && (
            <div style={{
              marginBottom: 18,
              padding: '12px 14px',
              background: 'rgba(155,109,255,0.06)',
              border: '1px solid rgba(155,109,255,0.18)',
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B6DFF', marginBottom: 8 }}>
                Your previous requests for this item
              </div>
              {existingRequests.map(r => (
                <div key={r.id} style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 6, lineHeight: 1.5 }}>
                  <span style={{ color: statusColor(r.status), fontWeight: 700 }}>
                    {statusLabel(r.status)}
                  </span>
                  {' · '}
                  <span style={{ color: '#6B8299' }}>
                    sent {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  {r.resolutionNote && (
                    <div style={{ marginTop: 3, color: '#d1d9e2', fontStyle: 'italic' }}>
                      &ldquo;{r.resolutionNote}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Just-sent confirmation */}
          {justSent ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(74,222,128,0.1)',
                border: '2px solid #4ade80',
                color: '#4ade80', fontSize: 28, marginBottom: 12,
              }}>
                ✓
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', marginBottom: 6 }}>
                Request sent
              </div>
              <div style={{ fontSize: 12, color: '#9BB0C4', maxWidth: 360, margin: '0 auto', lineHeight: 1.55 }}>
                She&apos;ll get in touch soon. You can check the status on this item anytime.
              </div>
              <button
                onClick={onClose}
                style={{
                  marginTop: 18,
                  background: '#C9A96E', color: '#142D48',
                  border: 'none', borderRadius: 4,
                  padding: '12px 24px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: 'pointer', minHeight: 44,
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={label}>Topic</label>
                <select
                  value={topic}
                  onChange={e => setTopic(e.target.value as LicensingRequestTopic)}
                  style={{ ...input, appearance: 'auto' as const }}
                >
                  {Object.entries(TOPIC_LABELS).map(([key, lbl]) => (
                    <option key={key} value={key}>{lbl}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>What do you need?</label>
                <textarea
                  required
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={isMobile ? 5 : 6}
                  placeholder="Briefly describe what you need help with. Include any dates, document names, or questions."
                  style={{
                    ...input,
                    minHeight: 120,
                    resize: 'vertical',
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4 }}>
                  {message.length < 10 ? `${10 - message.length} more characters` : `${message.length} characters`}
                </div>
              </div>

              {error && (
                <div style={{
                  fontSize: 11, color: '#f87171',
                  padding: '8px 12px',
                  background: 'rgba(248,113,113,0.08)',
                  borderRadius: 4,
                  border: '1px solid rgba(248,113,113,0.2)',
                }}>
                  {error}
                </div>
              )}

              <div style={{
                display: 'flex', gap: 10,
                flexDirection: isMobile ? 'column-reverse' : 'row',
                justifyContent: 'flex-end',
                paddingTop: 8,
                borderTop: '1px solid rgba(255,255,255,0.05)',
                marginTop: 4,
              }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#9BB0C4', borderRadius: 4,
                    padding: '12px 18px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: submitting ? 'wait' : 'pointer', minHeight: 44,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || message.trim().length < 10}
                  style={{
                    background: submitting || message.trim().length < 10 ? 'rgba(201,169,110,0.4)' : '#C9A96E',
                    color: '#142D48', border: 'none', borderRadius: 4,
                    padding: '12px 20px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: submitting ? 'wait' : 'pointer', minHeight: 44, flex: 1,
                  }}
                >
                  {submitting ? 'Sending...' : 'Send request'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function statusLabel(s: string) {
  switch (s) {
    case 'OPEN': return 'Open'
    case 'IN_PROGRESS': return 'In progress'
    case 'RESOLVED': return 'Resolved'
    case 'CLOSED': return 'Closed'
    default: return s
  }
}

function statusColor(s: string) {
  switch (s) {
    case 'OPEN': return '#f59e0b'
    case 'IN_PROGRESS': return '#9B6DFF'
    case 'RESOLVED': return '#4ade80'
    case 'CLOSED': return '#6B8299'
    default: return '#9BB0C4'
  }
}
