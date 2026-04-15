'use client'

import { useState } from 'react'
import CallReviewModal, { CallReviewData } from '@/components/CallReviewModal'
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
}

export default function AdminCallReviewPage() {
  const isMobile = useIsMobile()
  const [transcript, setTranscript] = useState('')
  const [contactName, setContactName] = useState('')
  const [callDate, setCallDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [showModal, setShowModal] = useState(false)

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0

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
        }),
      })
      const data = await res.json() as { result?: AnalyzeResult; error?: string }
      if (!res.ok || !data.result) {
        setError(data.error ?? 'Failed to analyze')
        setLoading(false)
        return
      }
      setResult(data.result)
      setShowModal(true)
      setLoading(false)
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  const reset = () => {
    setTranscript('')
    setContactName('')
    setCallDate(new Date().toISOString().split('T')[0])
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
            Use this to review your own calls or a training call. Claude scores it on the same 6-dimension rubric your agents are graded on (opening, discovery, product, objections, closing, tone). <strong style={{ color: '#C9A96E' }}>Results are not saved</strong> — this is a one-shot coaching tool. If you want per-agent history, open the agent&apos;s drawer in the AFF Tracker.
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
                <input
                  type="date"
                  style={inputStyle}
                  value={callDate}
                  onChange={e => setCallDate(e.target.value)}
                />
              </div>
            </div>

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
                }}
              >
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
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
