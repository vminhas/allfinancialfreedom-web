'use client'

import { useEffect } from 'react'
import type { TrackMilestone, TrackAchievement } from './ClimbTrack'
import type { ClimbArticle } from './ClimbTab'

// Click into a marker → modal with full milestone detail and the
// reward artifact (badge close-up, generated article excerpt, custom
// note). For locked milestones, shows what they'll earn when they hit
// it. Backdrop blurs the page; entrance scales in from 0.95.

export default function MilestoneDetailModal({
  milestone,
  achievement,
  article,
  totalPoints,
  onClose,
}: {
  milestone: TrackMilestone
  achievement: TrackAchievement | null
  article: ClimbArticle | null
  totalPoints: number
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const accent = milestone.accentColor ?? '#C9A96E'
  const achieved = !!achievement
  const remaining = Math.max(0, milestone.pointThreshold - totalPoints)

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,22,40,0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'climb-modal-in 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 560,
          background: '#0C1E30',
          borderRadius: 12,
          border: `1px solid ${accent}66`,
          boxShadow: `0 24px 64px rgba(0,0,0,0.5), 0 0 64px ${accent}33`,
          overflow: 'hidden',
        }}
      >
        {/* Header band */}
        <div style={{
          background: `linear-gradient(135deg, ${accent}33, transparent)`,
          padding: '24px 28px',
          borderBottom: `1px solid ${accent}33`,
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: achieved ? accent : 'rgba(255,255,255,0.04)',
              border: `2px solid ${accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
              color: achieved ? '#0A1628' : accent,
              flexShrink: 0,
              boxShadow: achieved ? `0 0 24px ${accent}66` : 'none',
            }}>
              {milestone.iconKey ?? (achieved ? '✓' : '◯')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, marginBottom: 4 }}>
                {achieved ? 'Achieved' : remaining > 0 ? `${remaining.toLocaleString()} points to go` : 'Available now'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', lineHeight: 1.2, marginBottom: 6 }}>
                {milestone.title}
              </div>
              {milestone.tagline && (
                <div style={{ fontSize: 13, color: '#9BB0C4', lineHeight: 1.5 }}>
                  {milestone.tagline}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#9BB0C4', fontSize: 14,
                width: 32, height: 32, borderRadius: 6,
                cursor: 'pointer', flexShrink: 0,
              }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px' }}>
          {milestone.description && (
            <p style={{ fontSize: 13, color: '#d1d9e2', lineHeight: 1.6, margin: 0, marginBottom: 18 }}>
              {milestone.description}
            </p>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            marginBottom: 18,
          }}>
            <Stat label="Threshold" value={`${milestone.pointThreshold.toLocaleString()} pts`} />
            <Stat label="Reward" value={rewardLabel(milestone.rewardType)} />
            {achieved && achievement && (
              <>
                <Stat label="Achieved" value={new Date(achievement.achievedAt).toLocaleDateString()} />
                <Stat label="At Points" value={achievement.pointsAtAchievement.toLocaleString()} />
              </>
            )}
          </div>

          {/* Article reward artifact, if applicable */}
          {achieved && milestone.rewardType === 'ARTICLE' && article && (
            <div style={{
              borderTop: `1px solid ${accent}33`,
              paddingTop: 18, marginTop: 12,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>
                Your Story
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 10 }}>
                {article.title}
              </div>
              <div style={{ fontSize: 12, color: '#d1d9e2', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {article.body}
              </div>
            </div>
          )}

          {achieved && milestone.rewardType === 'ARTICLE' && !article && (
            <div style={{ fontSize: 11, color: '#9BB0C4', fontStyle: 'italic' }}>
              Your personalized article is generating. Refresh in a minute and it&apos;ll be here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 6,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 9, color: '#6B8299', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{value}</div>
    </div>
  )
}

function rewardLabel(type: string): string {
  switch (type) {
    case 'BADGE': return '🏷 Badge'
    case 'DISCORD_CALLOUT': return '📣 Discord callout'
    case 'ARTICLE': return '📰 AI-written article'
    case 'CUSTOM': return '🎁 Custom reward'
    default: return type
  }
}
