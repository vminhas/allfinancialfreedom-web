'use client'

import { useEffect, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CallReviewData {
  id: string
  overallScore: number
  rubricScores: {
    opening: number
    discovery: number
    product: number
    objections: number
    closing: number
    tone: number
  }
  strengths: string[]
  weaknesses: string[]
  coachingTips: string[]
  nextSteps: string[]
  summary: string
  flaggedForCoaching: boolean
  adminNotes?: string | null
  discussedAt?: string | null
  reviewedAt: string
}

export interface CallReviewModalProps {
  review: CallReviewData
  callDate: string
  contactName: string
  /** Admin mode shows the admin actions section (notes, mark discussed, un/flag) */
  adminMode?: boolean
  onClose: () => void
  /** Called when admin edits notes/discussed/flag — receives only the updated fields */
  onAdminUpdate?: (patch: Partial<Pick<CallReviewData, 'adminNotes' | 'discussedAt' | 'flaggedForCoaching'>>) => Promise<void>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RUBRIC = [
  { key: 'opening',    label: 'Opening & Rapport',    desc: 'Built trust in the first 2 minutes' },
  { key: 'discovery',  label: 'Discovery & Needs',    desc: 'Asked open questions, understood goals' },
  { key: 'product',    label: 'Product Knowledge',    desc: 'Accurate, confident, tied to client needs' },
  { key: 'objections', label: 'Objection Handling',   desc: 'Empathized, reframed, never defensive' },
  { key: 'closing',    label: 'Closing & Next Steps', desc: 'Clear ask, scheduled follow-up' },
  { key: 'tone',       label: 'Tone & Empathy',       desc: 'Warm, patient, genuine' },
] as const

function scoreColor(score: number) {
  if (score >= 80) return '#4ade80' // green
  if (score >= 60) return '#f59e0b' // amber
  return '#f87171'                  // red
}

function scoreLabel(score: number) {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 55) return 'Fair'
  return 'Needs work'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CallReviewModal({
  review,
  callDate,
  contactName,
  adminMode = false,
  onClose,
  onAdminUpdate,
}: CallReviewModalProps) {
  const isMobile = useIsMobile()
  const [adminNotes, setAdminNotes] = useState(review.adminNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [adminSectionOpen, setAdminSectionOpen] = useState(false)

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

  const overallColor = scoreColor(review.overallScore)
  const formattedDate = new Date(callDate).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  async function handleMarkDiscussed() {
    if (!onAdminUpdate) return
    setSaving(true)
    try {
      await onAdminUpdate({ discussedAt: new Date().toISOString() })
    } finally { setSaving(false) }
  }

  async function handleSaveNotes() {
    if (!onAdminUpdate) return
    setSaving(true)
    try {
      await onAdminUpdate({ adminNotes: adminNotes || null })
    } finally { setSaving(false) }
  }

  async function handleToggleFlag() {
    if (!onAdminUpdate) return
    setSaving(true)
    try {
      await onAdminUpdate({ flaggedForCoaching: !review.flaggedForCoaching })
    } finally { setSaving(false) }
  }

  // ─── Styles (responsive via useIsMobile) ───────────────────────────────────
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
    width: isMobile ? '100%' : 'min(560px, 100vw)',
    maxHeight: isMobile ? '92vh' : '90vh',
    overflowY: 'auto',
    boxShadow: '0 -24px 80px rgba(0,0,0,0.55)',
    display: 'flex', flexDirection: 'column',
    WebkitOverflowScrolling: 'touch',
  }

  const headerStyle: React.CSSProperties = {
    padding: isMobile ? '18px 20px 14px' : '22px 28px 16px',
    borderBottom: '1px solid rgba(201,169,110,0.1)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    position: 'sticky', top: 0,
    background: '#132238', zIndex: 2,
  }

  const contentStyle: React.CSSProperties = {
    padding: isMobile ? '18px 20px 0' : '24px 28px 0',
    flex: 1,
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
    textTransform: 'uppercase', color: '#C9A96E',
    marginBottom: 10,
  }

  const closeBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(201,169,110,0.25)',
    borderRadius: 6,
    width: 44, height: 44,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    color: '#C9A96E', fontSize: 18, lineHeight: 1,
    flexShrink: 0,
  }

  return (
    <div
      style={overlayStyle}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={modalStyle}>
        {/* ── Header ─────────────────────────────── */}
        <div style={headerStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              Call Review
            </div>
            <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 500, color: '#ffffff', lineHeight: 1.25 }}>
              {contactName}
            </div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
              {formattedDate} · AI coaching review
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtnStyle}>✕</button>
        </div>

        <div style={contentStyle}>
          {/* ── Overall score ─────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: isMobile ? 22 : 28 }}>
            <div
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobile ? 96 : 112,
                height: isMobile ? 96 : 112,
                borderRadius: '50%',
                border: `3px solid ${overallColor}`,
                background: `${overallColor}12`,
                boxShadow: `0 0 40px ${overallColor}22`,
              }}
            >
              <div style={{ fontSize: isMobile ? 34 : 40, fontWeight: 700, color: overallColor, lineHeight: 1 }}>
                {review.overallScore}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: overallColor, marginTop: 3 }}>
                {scoreLabel(review.overallScore)}
              </div>
            </div>
            {review.flaggedForCoaching && (
              <div style={{
                marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 999,
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f87171' }}>
                  ⚑ Flagged for coaching
                </span>
              </div>
            )}
          </div>

          {/* ── What this is (explainer) ─────────── */}
          <div style={{
            marginBottom: 20,
            padding: '12px 14px',
            background: 'rgba(201,169,110,0.05)',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 6,
            fontSize: 11,
            color: '#9BB0C4',
            lineHeight: 1.55,
          }}>
            {adminMode
              ? <>Claude reviewed this call transcript against the AFF methodology. Scores show how the agent performed on each dimension. Use the sections below to understand strengths, gaps, and what to coach on.</>
              : <>Your call was reviewed against the AFF playbook. Use this feedback to plan your next call. Scores help you track your growth over time — no one else is &quot;grading&quot; you.</>
            }
          </div>

          {/* ── Rubric bars ────────────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <div style={sectionLabel}>Rubric Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {RUBRIC.map(dim => {
                const score = review.rubricScores[dim.key]
                const color = scoreColor(score)
                return (
                  <div key={dim.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#ffffff' }}>{dim.label}</div>
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 1 }}>{dim.desc}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}>{score}</div>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${score}%`,
                        background: color, borderRadius: 3,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Summary ────────────────────────────── */}
          <ReviewSection label="Summary" color="#9BB0C4">
            <p style={{ fontSize: 13, color: '#d1d9e2', lineHeight: 1.6, margin: 0 }}>{review.summary}</p>
          </ReviewSection>

          {/* ── Strengths ──────────────────────────── */}
          {review.strengths.length > 0 && (
            <ReviewSection label="What went well" color="#4ade80" icon="✓">
              <BulletList items={review.strengths} color="#4ade80" />
            </ReviewSection>
          )}

          {/* ── Weaknesses ─────────────────────────── */}
          {review.weaknesses.length > 0 && (
            <ReviewSection label="Areas to improve" color="#f59e0b" icon="→">
              <BulletList items={review.weaknesses} color="#f59e0b" />
            </ReviewSection>
          )}

          {/* ── Coaching tips ──────────────────────── */}
          {review.coachingTips.length > 0 && (
            <ReviewSection label="Try this next time" color="#C9A96E" icon="◆">
              <BulletList items={review.coachingTips} color="#C9A96E" />
            </ReviewSection>
          )}

          {/* ── Next steps ─────────────────────────── */}
          {review.nextSteps.length > 0 && (
            <ReviewSection label="Next steps with this prospect" color="#9B6DFF" icon="▶">
              <BulletList items={review.nextSteps} color="#9B6DFF" />
            </ReviewSection>
          )}

          {/* ── Admin actions (collapsed) ──────────── */}
          {adminMode && (
            <div style={{ marginTop: 20, marginBottom: 20, borderTop: '1px solid rgba(201,169,110,0.1)', paddingTop: 16 }}>
              <button
                onClick={() => setAdminSectionOpen(v => !v)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
                  color: '#C9A96E', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                }}
              >
                <span>{adminSectionOpen ? '▼' : '▶'}</span>
                Admin actions
              </button>
              {adminSectionOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 6 }}>
                      Coaching notes (visible only to admins)
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={e => setAdminNotes(e.target.value)}
                      rows={3}
                      placeholder="What did you discuss with the agent?"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: '#0A1628',
                        border: '1px solid rgba(201,169,110,0.2)',
                        borderRadius: 4, color: '#d1d9e2',
                        padding: '10px 12px', fontSize: 12,
                        fontFamily: 'inherit',
                        resize: 'vertical',
                      }}
                    />
                    <button
                      onClick={handleSaveNotes}
                      disabled={saving}
                      style={{
                        marginTop: 6,
                        background: 'transparent',
                        border: '1px solid rgba(201,169,110,0.3)',
                        borderRadius: 4, color: '#C9A96E',
                        padding: '8px 14px', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: saving ? 'wait' : 'pointer', minHeight: 36,
                      }}
                    >
                      Save notes
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={handleMarkDiscussed}
                      disabled={saving || !!review.discussedAt}
                      style={{
                        background: review.discussedAt ? 'rgba(74,222,128,0.12)' : 'rgba(201,169,110,0.08)',
                        border: `1px solid ${review.discussedAt ? 'rgba(74,222,128,0.35)' : 'rgba(201,169,110,0.25)'}`,
                        borderRadius: 4,
                        color: review.discussedAt ? '#4ade80' : '#C9A96E',
                        padding: '10px 14px', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: saving || review.discussedAt ? 'default' : 'pointer',
                        minHeight: 44, flex: 1, minWidth: 140,
                      }}
                    >
                      {review.discussedAt ? '✓ Discussed' : 'Mark as discussed'}
                    </button>
                    <button
                      onClick={handleToggleFlag}
                      disabled={saving}
                      style={{
                        background: review.flaggedForCoaching ? 'rgba(248,113,113,0.1)' : 'transparent',
                        border: `1px solid ${review.flaggedForCoaching ? 'rgba(248,113,113,0.35)' : 'rgba(201,169,110,0.2)'}`,
                        borderRadius: 4,
                        color: review.flaggedForCoaching ? '#f87171' : '#9BB0C4',
                        padding: '10px 14px', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: saving ? 'wait' : 'pointer',
                        minHeight: 44, flex: 1, minWidth: 140,
                      }}
                    >
                      {review.flaggedForCoaching ? '✕ Unflag' : '⚑ Flag for coaching'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer (sticky on mobile) ───────────── */}
        <div style={{
          padding: isMobile ? '14px 20px calc(14px + env(safe-area-inset-bottom))' : '18px 28px 22px',
          borderTop: '1px solid rgba(201,169,110,0.1)',
          background: '#132238',
          position: isMobile ? 'sticky' : 'static',
          bottom: 0,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#C9A96E', color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: isMobile ? '14px 24px' : '12px 26px',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
              minHeight: 44,
              width: isMobile ? '100%' : 'auto',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReviewSection({ label, color, icon, children }: {
  label: string
  color: string
  icon?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color, marginBottom: 10,
      }}>
        {icon && <span>{icon}</span>}{label}
      </div>
      {children}
    </div>
  )
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ color, flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span>
          <span style={{ fontSize: 13, color: '#d1d9e2', lineHeight: 1.55 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}
