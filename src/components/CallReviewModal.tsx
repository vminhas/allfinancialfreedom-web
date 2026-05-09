'use client'

import { useEffect, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
const OUTCOME_LABELS: Record<string, string> = {
  RECRUITED:           'Recruited',
  APPOINTMENT_BOOKED:  'Appointment Booked',
  POLICY_CLOSED:       'Policy Closed',
  FOLLOW_UP_SCHEDULED: 'Follow-up Scheduled',
  NOT_INTERESTED:      'Not Interested',
  NO_CONTACT:          'No Contact / No Answer',
}

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
  scoreBoosters?: Partial<Record<'opening' | 'discovery' | 'product' | 'objections' | 'closing' | 'tone', string>> | null
  flaggedForCoaching: boolean
  adminNotes?: string | null
  discussedAt?: string | null
  reviewedAt: string
}

export interface CallReviewModalProps {
  review: CallReviewData
  callDate: string
  contactName: string
  outcome?: string | null
  /** Admin mode shows the admin actions section (notes, mark discussed, un/flag) */
  adminMode?: boolean
  onClose: () => void
  /** Called when admin edits notes/discussed/flag — receives only the updated fields */
  onAdminUpdate?: (patch: Partial<Pick<CallReviewData, 'adminNotes' | 'discussedAt' | 'flaggedForCoaching'>>) => Promise<void>
  /**
   * If provided, renders an outcome dropdown next to the score so the admin
   * can record what actually happened on the call (recruited, appointment
   * booked, etc.) after running the review. Returns once persisted.
   */
  onOutcomeChange?: (next: string | null) => Promise<void>
}

const OUTCOME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'RECRUITED',          label: '🎉 Recruited' },
  { value: 'APPOINTMENT_BOOKED', label: '📅 Appointment booked' },
  { value: 'POLICY_CLOSED',      label: '✅ Policy closed' },
  { value: 'FOLLOW_UP_SCHEDULED',label: '↻ Follow-up scheduled' },
  { value: 'NOT_INTERESTED',     label: '✕ Not interested' },
  { value: 'NO_CONTACT',         label: '— No contact' },
]

// ─── Constants ────────────────────────────────────────────────────────────────

// Rubric descriptions written for the agent / admin reading the
// review — same NEPQ vocabulary the SYSTEM_PROMPT uses, so the
// model's scoreBoosters and the user's mental model line up. Each
// dimension is now structured as three parts so the modal can render
// them as three visually distinct blocks: a one-line "what we
// measure" subhead, a green "scores high" block, and a red "scores
// low" block. Easier to scan than a paragraph.
const RUBRIC = [
  {
    key: 'opening',
    label: 'Opening & Rapport',
    what: 'NEPQ Stage 1: Connection. The first 7-12 seconds.',
    highScore: 'Calm, curious tone with a Connection Question ("have you found what you\'re looking for?", "what attracted your attention?"). Disarming phrase: "I just had time to get back to you... I\'m not sure we can even help yet."',
    lowScore: 'Pitching, "I noticed you filled out a form", steamrolling ("Hi, do you have 2 minutes?"), eager / needy / aggressive tone.',
  },
  {
    key: 'discovery',
    label: 'Discovery & Needs',
    what: 'NEPQ Stage 2: Engagement. Five layers in order: Situation → Problem-Awareness → Solution-Awareness → Consequence → Qualifying.',
    highScore: 'Identity frame ("some people don\'t mind putting that stress on family"), "forced" framing, slow ellipsis pauses on heavy questions, all five layers in order.',
    lowScore: 'Surface-level fact questions ("any active policies?"), skipping straight to product, asking the prospect to commit before pain is built.',
  },
  {
    key: 'product',
    label: 'Product Knowledge',
    what: 'NEPQ Stage 4: Presentation. "Present without presenting." Should be <10% of the call.',
    highScore: '"Remember how you mentioned [their problem]? The way we solve that for clients in your situation is [specific feature]." Every claim ties back to discovery.',
    lowScore: 'Feature-dumping, generic talking points, "we\'ve been in business 30 years", premature numbers (price before pain).',
  },
  {
    key: 'objections',
    label: 'Objection Handling',
    what: 'NEPQ method: never reframe, never rebut. Get behind the concern with a question.',
    highScore: '"What makes you feel that way?" / "Help me understand what\'s holding you back." Let the prospect talk themselves through it.',
    lowScore: '"I understand, but...", arguing, scarcity ("this rate is going up"), or steamrolling past the concern.',
  },
  {
    key: 'closing',
    label: 'Closing & Next Steps',
    what: 'NEPQ Stage 5: Commitment + Stage 3: Transition. The close is a question, not a statement.',
    highScore: 'Commitment Questions: "Which option would you lean towards?" → "How come that one?". Transition formula: "Based on what you said... + ...is making you feel [emotion]."',
    lowScore: 'Trial closes early, pressure, assumptive close before discovery is complete, two-option close before pain is built.',
  },
  {
    key: 'tone',
    label: 'Tone & Empathy',
    what: 'JLM tonality + verbal cues — what the words signal in the transcript.',
    highScore: 'Curious-frame: "I\'m just curious...", "just so I understand...". Echo the prospect\'s exact words back. Ellipsis pauses on heavy moments. Bridging cues ("aww, ok", "got it") so it doesn\'t feel scripted.',
    lowScore: 'Certainty statements ("you need..."), pushy phrases ("real quick", "you should"), clinical language ("per our conversation"), missing pace shifts.',
  },
] as const

const POSITIVE_OUTCOME_KEYS = new Set(['RECRUITED', 'APPOINTMENT_BOOKED', 'POLICY_CLOSED'])

// Maps the 6 rubric dimensions to anchor IDs on the in-portal NEPQ
// playbook page (/agents/resources/coaching/nepq#<id>). Lets the
// per-dimension chip drop the user into the exact stage of the
// playbook that explains the technique they're being scored on.
const RUBRIC_PLAYBOOK_ANCHOR: Record<string, string> = {
  opening:    'connection',
  discovery:  'engagement',
  product:    'presentation',
  objections: 'objections',
  closing:    'commitment',
  tone:       'tone',
}

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
  outcome,
  adminMode = false,
  onClose,
  onAdminUpdate,
  onOutcomeChange,
}: CallReviewModalProps) {
  const isMobile = useIsMobile()
  const [adminNotes, setAdminNotes] = useState(review.adminNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [adminSectionOpen, setAdminSectionOpen] = useState(false)
  // Tracks pending outcome changes so the dropdown can show a saving
  // indicator and disable itself mid-write.
  const [outcomeSaving, setOutcomeSaving] = useState(false)
  const [currentOutcome, setCurrentOutcome] = useState<string | null>(outcome ?? null)
  useEffect(() => { setCurrentOutcome(outcome ?? null) }, [outcome])

  async function handleOutcomeChange(next: string) {
    if (!onOutcomeChange) return
    const value = next === '' ? null : next
    setOutcomeSaving(true)
    setCurrentOutcome(value)
    try {
      await onOutcomeChange(value)
    } catch {
      // Revert on failure so the dropdown reflects DB state.
      setCurrentOutcome(outcome ?? null)
    } finally {
      setOutcomeSaving(false)
    }
  }

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
            {outcome && OUTCOME_LABELS[outcome] && !onOutcomeChange && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                marginTop: 6, padding: '4px 10px', borderRadius: 999,
                background: POSITIVE_OUTCOME_KEYS.has(outcome) ? 'rgba(74,222,128,0.1)' : 'rgba(107,130,153,0.15)',
                border: `1px solid ${POSITIVE_OUTCOME_KEYS.has(outcome) ? 'rgba(74,222,128,0.3)' : 'rgba(107,130,153,0.3)'}`,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: POSITIVE_OUTCOME_KEYS.has(outcome) ? '#4ade80' : '#9BB0C4' }}>
                  {POSITIVE_OUTCOME_KEYS.has(outcome) ? '✓' : '→'} {OUTCOME_LABELS[outcome]}
                </span>
              </div>
            )}
            {/* Editable outcome dropdown when onOutcomeChange is wired
                (vault admin call-review flow). Replaces the read-only
                pill above so the user has one source of truth for
                "what happened on this call." */}
            {onOutcomeChange && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9BB0C4' }}>
                  Outcome
                </span>
                <select
                  value={currentOutcome ?? ''}
                  disabled={outcomeSaving}
                  onChange={e => handleOutcomeChange(e.target.value)}
                  style={{
                    background: currentOutcome && POSITIVE_OUTCOME_KEYS.has(currentOutcome) ? 'rgba(74,222,128,0.1)' : 'rgba(107,130,153,0.12)',
                    color: currentOutcome && POSITIVE_OUTCOME_KEYS.has(currentOutcome) ? '#4ade80' : '#d1d9e2',
                    border: `1px solid ${currentOutcome && POSITIVE_OUTCOME_KEYS.has(currentOutcome) ? 'rgba(74,222,128,0.4)' : 'rgba(107,130,153,0.3)'}`,
                    borderRadius: 999, padding: '4px 12px',
                    fontSize: 11, fontWeight: 600, cursor: outcomeSaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">— Not recorded</option>
                  {OUTCOME_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {outcomeSaving && <span style={{ fontSize: 10, color: '#6B8299' }}>saving...</span>}
              </div>
            )}
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

          {/* ── What this is (explainer + playbook link) ──── */}
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
            <div style={{ marginBottom: 8 }}>
              {adminMode
                ? <>Claude reviewed this call against the <strong style={{ color: '#C9A96E' }}>NEPQ playbook</strong> AFF coaches against (Connection &middot; Engagement &middot; Transition &middot; Presentation &middot; Commitment). Scores show how the agent performed on each dimension. Use the sections below for strengths, gaps, and coaching tips referencing specific NEPQ techniques.</>
                : <>Your call was graded against the <strong style={{ color: '#C9A96E' }}>NEPQ playbook</strong> (Connection &middot; Engagement &middot; Transition &middot; Presentation &middot; Commitment). Coaching tips reference specific NEPQ techniques. Tap any rubric dimension below to learn the playbook for that stage.</>
              }
            </div>
            <a
              href="/agents/resources/coaching/nepq"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color: '#C9A96E', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                textDecoration: 'none',
                padding: '4px 10px', borderRadius: 3,
                border: '1px solid rgba(201,169,110,0.4)',
                background: 'rgba(201,169,110,0.08)',
              }}
            >◐ Read the NEPQ Playbook ↗</a>
          </div>

          {/* ── Rubric bars ────────────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <div style={sectionLabel}>Rubric Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {RUBRIC.map(dim => {
                const score = review.rubricScores[dim.key]
                const color = scoreColor(score)
                const booster = review.scoreBoosters?.[dim.key]
                const anchor = RUBRIC_PLAYBOOK_ANCHOR[dim.key]
                return (
                  <div key={dim.key} style={{
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{dim.label}</div>
                          {anchor && (
                            <a
                              href={`/agents/resources/coaching/nepq#${anchor}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open the NEPQ playbook section for ${dim.label}`}
                              style={{
                                fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                color: '#C9A96E', textDecoration: 'none',
                                padding: '2px 7px', borderRadius: 999,
                                border: '1px solid rgba(201,169,110,0.3)',
                                background: 'rgba(201,169,110,0.06)',
                                whiteSpace: 'nowrap',
                              }}
                            >Playbook ↗</a>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 3, lineHeight: 1.5, fontStyle: 'italic' }}>{dim.what}</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{
                        height: '100%', width: `${score}%`,
                        background: color, borderRadius: 3,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>

                    {/* Two-up high/low score criteria so the reader
                        can scan what to do vs what to avoid without
                        parsing a paragraph. Stacks vertically on
                        narrow screens. */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 8,
                    }}>
                      <div style={{
                        padding: '8px 10px',
                        background: 'rgba(74,222,128,0.06)',
                        border: '1px solid rgba(74,222,128,0.22)',
                        borderRadius: 4,
                      }}>
                        <div style={{
                          fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                          color: '#86efac', marginBottom: 5,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <span>✓</span><span>Scores High</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#d1d9e2', lineHeight: 1.55 }}>{dim.highScore}</div>
                      </div>
                      <div style={{
                        padding: '8px 10px',
                        background: 'rgba(248,113,113,0.06)',
                        border: '1px solid rgba(248,113,113,0.22)',
                        borderRadius: 4,
                      }}>
                        <div style={{
                          fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                          color: '#fca5a5', marginBottom: 5,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <span>✕</span><span>Scores Low</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#d1d9e2', lineHeight: 1.55 }}>{dim.lowScore}</div>
                      </div>
                    </div>
                    {booster && score < 80 && (
                      <div style={{
                        marginTop: 10,
                        padding: '8px 10px',
                        background: 'rgba(245,158,11,0.05)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 4,
                      }}>
                        <div style={{
                          fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                          color: '#fbbf24', marginBottom: 5,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <span>↑</span><span>How to Raise This Score</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#d1d9e2', lineHeight: 1.55 }}>{booster}</div>
                      </div>
                    )}
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
          {Array.isArray(review.strengths) && review.strengths.length > 0 && (
            <ReviewSection label="What went well" color="#4ade80" icon="✓">
              <BulletList items={review.strengths} color="#4ade80" />
            </ReviewSection>
          )}

          {/* ── Weaknesses ─────────────────────────── */}
          {Array.isArray(review.weaknesses) && review.weaknesses.length > 0 && (
            <ReviewSection label="Areas to improve" color="#f59e0b" icon="→">
              <BulletList items={review.weaknesses} color="#f59e0b" />
            </ReviewSection>
          )}

          {/* ── Coaching tips ──────────────────────── */}
          {Array.isArray(review.coachingTips) && review.coachingTips.length > 0 && (
            <ReviewSection label="Try this next time" color="#C9A96E" icon="◆">
              <BulletList items={review.coachingTips} color="#C9A96E" />
            </ReviewSection>
          )}

          {/* ── Next steps ─────────────────────────── */}
          {Array.isArray(review.nextSteps) && review.nextSteps.length > 0 && (
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
  // Belt-and-suspenders: callers already gate on Array.isArray, but keep
  // BulletList itself defensive so a stray non-array doesn't blank out
  // the whole modal with an uncaught error.
  const list = Array.isArray(items) ? items : []
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ color, flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span>
          <span style={{ fontSize: 13, color: '#d1d9e2', lineHeight: 1.55 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}
