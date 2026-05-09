'use client'

import { useState, useEffect, useCallback } from 'react'
import CallReviewModal, { CallReviewData } from '@/components/CallReviewModal'
import DatePicker from '@/components/DatePicker'
import Spinner from '@/components/Spinner'
import { useIsMobile } from '@/lib/useIsMobile'

interface AnalyzeResult {
  overallScore: number
  rubricScores: { opening: number; discovery: number; product: number; objections: number; closing: number; tone: number }
  strengths: string[]
  weaknesses: string[]
  coachingTips: string[]
  nextSteps: string[]
  summary: string
  flaggedForCoaching: boolean
  scriptName?: string | null
  scriptResourceUrl?: string | null
}

interface HistoryRow {
  id: string
  contactName: string | null
  callDate: string
  reviewedAt: string
  overallScore: number
  rubricScores: { opening: number; discovery: number; product: number; objections: number; closing: number; tone: number }
  summary: string
  notes: string | null
}

export default function AdminCallReviewPage() {
  const isMobile = useIsMobile()
  const [transcript, setTranscript] = useState('')
  const [contactName, setContactName] = useState('')
  const [callDate, setCallDate] = useState(new Date().toISOString().split('T')[0])
  // Parity with the agent-side call log form. Every admin-side review
  // can now capture the same context an agent would log from the field
  // (phone, subject, type, follow-up flag).
  const [phoneNumber, setPhoneNumber] = useState('')
  const [subject, setSubject] = useState('')
  const [callType, setCallType] = useState('')
  const [callTypeOther, setCallTypeOther] = useState('')
  const [followUpNeeded, setFollowUpNeeded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  // Persistent identifier for the saved AdminCallReview row. Set after
  // analyze (from the response) and after openHistoryItem (from the id).
  // Powers the in-modal outcome dropdown's PATCH path.
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reviewOutcome, setReviewOutcome] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [trend, setTrend] = useState<number | null>(null)
  // Map of CallType -> tagged SetupResource so the form can show
  // "Graded against: <resource>" the moment the admin picks a type.
  // Source of truth lives in /vault/setup; this is a read-only mirror.
  const [scriptsByCallType, setScriptsByCallType] = useState<Record<string, { id: string; label: string; aiScriptOutline: string | null; url: string | null }>>({})

  useEffect(() => {
    fetch('/api/admin/setup-resources')
      .then(r => r.ok ? r.json() : null)
      .then((d: { resources?: Array<{ id: string; label: string; url: string; callType: string | null; aiScriptOutline: string | null }> } | null) => {
        if (!d?.resources) return
        const next: typeof scriptsByCallType = {}
        for (const r of d.resources) {
          if (r.callType) {
            next[r.callType] = { id: r.id, label: r.label, aiScriptOutline: r.aiScriptOutline, url: r.url }
          }
        }
        setScriptsByCallType(next)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeScript = callType ? scriptsByCallType[callType] : null

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/admin/call-review/history')
    if (!res.ok) return
    const d = await res.json().catch(() => null) as { reviews?: unknown; trend?: unknown } | null
    // Defensive: if the response body is malformed (or older deploys
    // returned a different shape), fall back to an empty list rather
    // than crashing the page on history.map below.
    setHistory(Array.isArray(d?.reviews) ? (d!.reviews as HistoryRow[]) : [])
    setTrend(typeof d?.trend === 'number' ? d!.trend as number : null)
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const openHistoryItem = async (id: string) => {
    const res = await fetch(`/api/admin/call-review/${id}`)
    if (!res.ok) return
    const d = await res.json() as { review: AnalyzeResult & {
      id?: string
      contactName: string | null
      callDate: string
      callTranscript: string
      outcome?: string | null
      phoneNumber?: string | null
      subject?: string | null
      callType?: string | null
      callTypeOther?: string | null
      followUpNeeded?: boolean
    } }
    setResult(d.review)
    setReviewId(d.review.id ?? id)
    setReviewOutcome(d.review.outcome ?? null)
    setContactName(d.review.contactName ?? '')
    setCallDate(d.review.callDate.slice(0, 10))
    setTranscript(d.review.callTranscript)
    // Hydrate the parity fields so the form reflects the saved row
    // and re-analyze keeps them attached.
    setPhoneNumber(d.review.phoneNumber ?? '')
    setSubject(d.review.subject ?? '')
    setCallType(d.review.callType ?? '')
    setCallTypeOther(d.review.callTypeOther ?? '')
    setFollowUpNeeded(d.review.followUpNeeded === true)
    setShowModal(true)
  }

  const deleteHistoryItem = async (id: string) => {
    if (!confirm('Delete this saved review? This cannot be undone.')) return
    const res = await fetch(`/api/admin/call-review/${id}`, { method: 'DELETE' })
    if (res.ok) loadHistory()
  }

  const analyze = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/admin/call-review/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptText: transcript,
          contactName: contactName || 'Prospect',
          callDate,
          phoneNumber: phoneNumber.trim() || undefined,
          subject: subject.trim() || undefined,
          callType: callType || null,
          callTypeOther: callType === 'OTHER' ? callTypeOther.trim() || undefined : undefined,
          followUpNeeded,
          outcome: reviewOutcome || undefined,
        }),
      })
      const data = await res.json() as { result?: AnalyzeResult; reviewId?: string; error?: string }
      if (!res.ok || !data.result) {
        setError(data.error ?? 'Failed to analyze')
        setLoading(false)
        return
      }
      setResult(data.result)
      setReviewId(data.reviewId ?? null)
      // Keep reviewOutcome as-is: if the admin picked one before
      // analyze, it was saved with the review server-side and should
      // stay reflected in the modal's outcome dropdown. Nulling it
      // here forced a re-pick on every analyze.
      setShowModal(true)
      setLoading(false)
      // Refresh the history list so the new review appears immediately.
      loadHistory()
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  const reset = () => {
    setTranscript('')
    setContactName('')
    setCallDate(new Date().toISOString().split('T')[0])
    setPhoneNumber('')
    setSubject('')
    setCallType('')
    setCallTypeOther('')
    setFollowUpNeeded(false)
    setReviewOutcome(null)
    setReviewId(null)
    setResult(null)
    setShowModal(false)
    setError('')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0C1E30',
    border: '1px solid rgba(201,169,110,0.15)',
    borderRadius: 4, color: '#9BB0C4',
    padding: '10px 14px', fontSize: 13,
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: '#C9A96E',
    marginBottom: 6,
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 28,
        padding: '28px 0 24px',
        borderBottom: '1px solid rgba(201,169,110,0.08)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          All Financial Freedom
        </div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Call Review Tool
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
          Paste any call transcript and get AI coaching feedback against the AFF methodology.
        </p>
      </div>

      <div style={{ maxWidth: 760 }}>
        {/* Hero explainer */}
        <div style={{
          marginBottom: 24,
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(201,169,110,0.08), rgba(201,169,110,0.02))',
          border: '1px solid rgba(201,169,110,0.2)',
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(201,169,110,0.15)',
              border: '1px solid rgba(201,169,110,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#C9A96E', fontSize: 14 }}>◆</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>Standalone admin tool</div>
          </div>
          <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>
            Use this to review your own calls or a training call. Claude scores it on the same 6-dimension rubric your agents are graded on (opening, discovery, product, objections, closing, tone). <strong style={{ color: '#C9A96E' }}>Reviews are saved</strong>{' '}to your personal history below so you can track your progress over time. For per-agent review history, open the agent&apos;s drawer in the AFF Tracker.
          </div>
        </div>

        {/* Input form */}
        <div style={{
          background: '#142D48',
          border: '1px solid rgba(201,169,110,0.1)',
          borderRadius: 8,
          padding: isMobile ? '18px 16px' : '24px 28px',
        }}>
          <form onSubmit={analyze} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 12,
            }}>
              <div>
                <label style={labelStyle}>Contact / Prospect name</label>
                <input
                  style={inputStyle}
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Optional — helps Claude frame the review"
                />
              </div>
              <div>
                <label style={labelStyle}>Call date</label>
                <DatePicker value={callDate} onChange={setCallDate} max={new Date().toISOString().slice(0, 10)} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputStyle}
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  inputMode="tel"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label style={labelStyle}>Subject</label>
                <input
                  style={inputStyle}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label style={labelStyle}>Call type</label>
                <select
                  value={callType}
                  onChange={e => {
                    const next = e.target.value
                    setCallType(next)
                    if (next !== 'OTHER') setCallTypeOther('')
                  }}
                  style={{ ...inputStyle, appearance: 'none' as const }}
                >
                  <option value="">Select type (optional)</option>
                  <option value="RECRUIT">Recruit</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="CLIENT_APPOINTMENT">Client Appointment / Close</option>
                  <option value="OTHER">Other...</option>
                </select>
                {callType && (
                  <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 6, lineHeight: 1.5 }}>
                    {activeScript ? (
                      <>
                        <span style={{ color: '#C9A96E' }}>◆</span>{' '}
                        Graded against{' '}
                        <strong style={{ color: '#fff' }}>{activeScript.label}</strong>
                        {!activeScript.aiScriptOutline && (
                          <span style={{ color: '#f59e0b' }}> &middot; outline not generated yet</span>
                        )}{' '}
                        <a href="/vault/setup" style={{ color: '#C9A96E', textDecoration: 'underline' }}>
                          {activeScript.aiScriptOutline ? 'edit ↗' : 'set up ↗'}
                        </a>
                      </>
                    ) : (
                      <>
                        No script tagged for this call type.{' '}
                        <a href="/vault/setup" style={{ color: '#C9A96E', textDecoration: 'underline' }}>
                          Tag a resource ↗
                        </a>{' '}
                        to enable script-aware coaching.
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Outcome (optional)</label>
                <select
                  value={reviewOutcome ?? ''}
                  onChange={e => setReviewOutcome(e.target.value || null)}
                  style={{ ...inputStyle, appearance: 'none' as const }}
                >
                  <option value="">— Skip / set later</option>
                  <option value="RECRUITED">🎉 Recruited</option>
                  <option value="APPOINTMENT_BOOKED">📅 Appointment booked</option>
                  <option value="POLICY_CLOSED">✅ Policy closed</option>
                  <option value="FOLLOW_UP_SCHEDULED">↻ Follow-up scheduled</option>
                  <option value="NOT_INTERESTED">✕ Not interested</option>
                  <option value="NO_CONTACT">— No contact</option>
                </select>
                <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 6, lineHeight: 1.5 }}>
                  Pick it now if you already know how the call ended (the AI uses it to lean feedback toward what worked or what to fix). Skip if you don&apos;t know yet, you can set it after analyze from inside the review.
                </div>
              </div>
            </div>

            {callType === 'OTHER' && (
              <div>
                <label style={labelStyle}>Other (specify)</label>
                <input
                  style={inputStyle}
                  value={callTypeOther}
                  onChange={e => setCallTypeOther(e.target.value)}
                  placeholder="e.g. underwriting check-in, carrier callback"
                />
              </div>
            )}

            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: '#9BB0C4', cursor: 'pointer',
              padding: '4px 0',
            }}>
              <input
                type="checkbox"
                checked={followUpNeeded}
                onChange={e => setFollowUpNeeded(e.target.checked)}
                style={{ accentColor: '#C9A96E', width: 16, height: 16 }}
              />
              Follow-up needed
            </label>

            <div>
              <label style={labelStyle}>Call transcript *</label>
              <textarea
                required
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Paste your Fathom transcript here. Minimum 100 words. Include speaker tags if your tool provides them — Claude reads them."
                rows={isMobile ? 10 : 14}
                style={{
                  ...inputStyle,
                  minHeight: isMobile ? 220 : 300,
                  resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
              <div style={{ fontSize: 10, color: wordCount >= 100 ? '#4ade80' : '#6B8299', marginTop: 4 }}>
                {wordCount} words {wordCount < 100 && wordCount > 0 && '— need at least 100 for a useful review'}
              </div>
            </div>

            {error && (
              <div style={{
                fontSize: 12, color: '#f87171',
                padding: '10px 14px',
                background: 'rgba(248,113,113,0.08)',
                borderRadius: 4,
                border: '1px solid rgba(248,113,113,0.2)',
              }}>
                {error}
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: 10,
              flexDirection: isMobile ? 'column-reverse' : 'row',
              justifyContent: 'flex-end',
              paddingTop: 8,
              borderTop: '1px solid rgba(255,255,255,0.05)',
              marginTop: 4,
            }}>
              {result && (
                <button
                  type="button"
                  onClick={reset}
                  disabled={loading}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#9BB0C4', borderRadius: 4,
                    padding: '12px 20px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    cursor: loading ? 'wait' : 'pointer',
                    minHeight: 44,
                  }}
                >
                  Clear
                </button>
              )}
              {result && (
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(201,169,110,0.3)',
                    color: '#C9A96E', borderRadius: 4,
                    padding: '12px 20px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  View review again
                </button>
              )}
              <button
                type="submit"
                disabled={loading || wordCount < 100}
                style={{
                  background: loading || wordCount < 100 ? 'rgba(201,169,110,0.4)' : '#C9A96E',
                  color: '#142D48', border: 'none', borderRadius: 4,
                  padding: '12px 24px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: loading ? 'wait' : wordCount < 100 ? 'not-allowed' : 'pointer',
                  minHeight: 44,
                  boxShadow: loading || wordCount < 100 ? 'none' : '0 0 20px rgba(201,169,110,0.2)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                {loading && <Spinner size={14} color="#142D48" strokeWidth={2.4} />}
                {loading ? 'Analyzing...' : result ? 'Re-analyze' : 'Analyze call'}
              </button>
            </div>
          </form>
        </div>

        {/* Quick summary after analysis */}
        {result && !showModal && (
          <div style={{
            marginTop: 20,
            padding: '18px 22px',
            background: '#142D48',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                border: `2px solid ${result.overallScore >= 80 ? '#4ade80' : result.overallScore >= 60 ? '#f59e0b' : '#f87171'}`,
                background: `${result.overallScore >= 80 ? '#4ade80' : result.overallScore >= 60 ? '#f59e0b' : '#f87171'}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700,
                color: result.overallScore >= 80 ? '#4ade80' : result.overallScore >= 60 ? '#f59e0b' : '#f87171',
                flexShrink: 0,
              }}>
                {result.overallScore}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 3 }}>
                  Review complete
                </div>
                <div style={{ fontSize: 13, color: '#9BB0C4' }}>
                  Click below to see rubric, strengths, and coaching tips.
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: '#C9A96E', color: '#142D48',
                border: 'none', borderRadius: 4,
                padding: '12px 22px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: 'pointer', minHeight: 44,
              }}
            >
              View full review
            </button>
          </div>
        )}

        {/* Personal history */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18, fontWeight: 400, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
              Your review history
            </h2>
            {trend != null && history.length >= 8 && (
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '4px 10px', borderRadius: 4,
                background: trend >= 0 ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)',
                border: `1px solid ${trend >= 0 ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)'}`,
                color: trend >= 0 ? '#4ade80' : '#f87171',
              }}>
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} pts vs prior 5
              </span>
            )}
          </div>
          {history.length === 0 ? (
            <div style={{
              padding: '24px 20px', textAlign: 'center',
              border: '1px dashed rgba(201,169,110,0.18)', borderRadius: 6,
              color: '#6B8299', fontSize: 12, lineHeight: 1.6,
            }}>
              No reviews saved yet. Run your first transcript above and it&apos;ll appear here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Array.isArray(history) ? history : []).map(h => {
                const d = new Date(h.callDate)
                const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                const scoreColor = h.overallScore >= 80 ? '#4ade80' : h.overallScore >= 60 ? '#FBBF24' : '#f87171'
                return (
                  <div
                    key={h.id}
                    style={{
                      padding: '12px 16px',
                      background: '#142D48',
                      border: '1px solid rgba(201,169,110,0.10)',
                      borderRadius: 6,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 6,
                      background: `${scoreColor}14`, border: `1px solid ${scoreColor}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor, fontFamily: 'Cormorant Garamond, Georgia, serif', lineHeight: 1 }}>
                        {h.overallScore}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>
                        {h.contactName ?? 'Untitled call'}
                      </div>
                      <div style={{ color: '#6B8299', fontSize: 11, marginTop: 2 }}>
                        {dateStr}
                      </div>
                      <div style={{ color: '#9BB0C4', fontSize: 11, marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {h.summary}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => openHistoryItem(h.id)}
                        style={{
                          background: 'transparent', border: '1px solid rgba(201,169,110,0.35)',
                          color: '#C9A96E', borderRadius: 4, padding: '6px 12px',
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          cursor: 'pointer',
                        }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => deleteHistoryItem(h.id)}
                        style={{
                          background: 'transparent', border: '1px solid rgba(248,113,113,0.25)',
                          color: '#f87171', borderRadius: 4, padding: '6px 10px',
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          cursor: 'pointer',
                        }}
                        title="Delete saved review"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Review modal */}
      {result && showModal && (
        <CallReviewModal
          review={{
            id: 'admin-tool',
            overallScore: result.overallScore,
            rubricScores: result.rubricScores,
            strengths: result.strengths,
            weaknesses: result.weaknesses,
            coachingTips: result.coachingTips,
            nextSteps: result.nextSteps,
            summary: result.summary,
            flaggedForCoaching: result.flaggedForCoaching,
            reviewedAt: new Date().toISOString(),
          } as CallReviewData}
          callDate={callDate}
          contactName={contactName || 'Your call'}
          outcome={reviewOutcome}
          // adminMode toggles the explainer copy ("Claude reviewed this
          // call..." instead of "Your call was graded...") and exposes
          // future admin-only sections. The vault call-review page is
          // admin-by-definition; agent portal uses its own (without
          // this flag).
          adminMode={true}
          scriptName={result.scriptName ?? null}
          scriptResourceUrl={result.scriptResourceUrl ?? null}
          onClose={() => setShowModal(false)}
          // Outcome editor is wired only when we have a saved review row
          // (post-analyze or after openHistoryItem). Skipping it before
          // save would PATCH a non-existent id.
          onOutcomeChange={reviewId ? async (next) => {
            const res = await fetch(`/api/admin/call-review/${reviewId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ outcome: next }),
            })
            if (!res.ok) {
              const d = await res.json().catch(() => ({})) as { error?: string }
              throw new Error(d.error ?? `${res.status}`)
            }
            setReviewOutcome(next)
            // Refresh history so a flag (e.g. "RECRUITED") shows up
            // alongside the historical row immediately.
            loadHistory()
          } : undefined}
        />
      )}
    </div>
  )
}
