'use client'

import { useState } from 'react'

// The horizontal Climb track with milestone markers. Renders a
// background bar with a fill bar that ends at the agent's current
// position, plus markers placed proportionally along the track.
//
// Visual states per marker:
//   - locked (point < threshold)
//   - achieved (in achievementsByMilestoneId)
//   - next-up (lowest threshold not yet achieved) — pulses
//
// Click a marker → opens MilestoneDetailModal. Hover → tooltip.
//
// Mobile (≤640px): rotates 90° to a vertical orientation. The
// markers reflow stacked top-down so a thumb can scroll through them.

export interface TrackMilestone {
  id: string
  pointThreshold: number
  title: string
  tagline: string | null
  description: string | null
  iconKey: string | null
  accentColor: string | null
  rewardType: string
}

export interface TrackAchievement {
  milestoneId: string
  achievedAt: string
  pointsAtAchievement: number
}

export default function ClimbTrack({
  totalPoints,
  milestones,
  achievements,
  onMarkerClick,
  isMobile,
  freshMilestoneIds = new Set(),
}: {
  totalPoints: number
  milestones: TrackMilestone[]
  achievements: TrackAchievement[]
  onMarkerClick: (m: TrackMilestone) => void
  isMobile: boolean
  freshMilestoneIds?: Set<string>
}) {
  const achievedIds = new Set(achievements.map(a => a.milestoneId))
  const sorted = [...milestones].sort((a, b) => a.pointThreshold - b.pointThreshold)
  const maxThreshold = sorted.length > 0 ? sorted[sorted.length - 1].pointThreshold : 1

  // Position markers by rank (equal spacing), not by raw threshold.
  // Linear-by-threshold made the lower milestones (1K/5K/15K/25K)
  // bunch into the left ~17% of the track because the spread from
  // 1K→150K is so wide. Equal-rank spacing gives every milestone
  // the same visual weight, which reads better and keeps labels
  // from overlapping.
  const markerPositions = new Map<string, number>()
  sorted.forEach((m, i) => {
    const pct = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100
    markerPositions.set(m.id, pct)
  })

  // Fill % maps lifetime points onto the rank-spaced track. Walk the
  // sorted milestones: find the highest one already cleared and the
  // next one ahead. The fill ends at (cleared marker's pct) + the
  // proportional progress between cleared and next.
  const fillPct = (() => {
    if (sorted.length === 0) return 0
    if (totalPoints <= sorted[0].pointThreshold) {
      return Math.max(0, (totalPoints / sorted[0].pointThreshold) * (markerPositions.get(sorted[0].id) ?? 0))
    }
    let lastClearedIdx = -1
    for (let i = 0; i < sorted.length; i++) {
      if (totalPoints >= sorted[i].pointThreshold) lastClearedIdx = i
      else break
    }
    if (lastClearedIdx === sorted.length - 1) return 100
    const lower = sorted[lastClearedIdx]
    const upper = sorted[lastClearedIdx + 1]
    const lowerPct = markerPositions.get(lower.id) ?? 0
    const upperPct = markerPositions.get(upper.id) ?? 100
    const span = upper.pointThreshold - lower.pointThreshold
    const into = totalPoints - lower.pointThreshold
    return lowerPct + (into / span) * (upperPct - lowerPct)
  })()

  // Next-up is the lowest threshold not yet achieved.
  const nextUp = sorted.find(m => !achievedIds.has(m.id))?.id ?? null

  if (isMobile) {
    return (
      <VerticalTrack
        sorted={sorted}
        achievedIds={achievedIds}
        achievements={achievements}
        nextUpId={nextUp}
        totalPoints={totalPoints}
        maxThreshold={maxThreshold}
        onMarkerClick={onMarkerClick}
        freshMilestoneIds={freshMilestoneIds}
      />
    )
  }

  return (
    <div style={{ padding: '40px 24px 24px', position: 'relative' }}>
      {/* Track line + fill */}
      <div
        style={{
          position: 'relative',
          height: 6,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: `${fillPct}%`,
            background: 'linear-gradient(90deg, #8B6F2E, #C9A96E, #E0BC52)',
            borderRadius: 6,
            transition: 'width 1.6s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: '0 0 16px rgba(201,169,110,0.5)',
          }}
        />
        {/* Markers */}
        {sorted.map(m => {
          const pct = markerPositions.get(m.id) ?? 0
          const achieved = achievedIds.has(m.id)
          const isNext = nextUp === m.id
          const isFresh = freshMilestoneIds.has(m.id)
          return (
            <Marker
              key={m.id}
              milestone={m}
              achieved={achieved}
              isNext={isNext}
              isFresh={isFresh}
              positionStyle={{ left: `calc(${pct}% - 18px)`, top: -16 }}
              labelPosition="below"
              achievement={achievements.find(a => a.milestoneId === m.id) ?? null}
              onClick={() => onMarkerClick(m)}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60, fontSize: 10, color: '#6B8299', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        <span>Start</span>
        <span>Summit ({maxThreshold.toLocaleString()})</span>
      </div>
    </div>
  )
}

function VerticalTrack({
  sorted, achievedIds, achievements, nextUpId, totalPoints, maxThreshold,
  onMarkerClick, freshMilestoneIds,
}: {
  sorted: TrackMilestone[]
  achievedIds: Set<string>
  achievements: TrackAchievement[]
  nextUpId: string | null
  totalPoints: number
  maxThreshold: number
  onMarkerClick: (m: TrackMilestone) => void
  freshMilestoneIds: Set<string>
}) {
  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ position: 'relative', paddingLeft: 36 }}>
        {/* Vertical rail */}
        <div
          style={{
            position: 'absolute',
            left: 18,
            top: 6,
            bottom: 6,
            width: 4,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 4,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 18,
            top: 6,
            width: 4,
            height: `${Math.min(100, (totalPoints / maxThreshold) * 100)}%`,
            background: 'linear-gradient(180deg, #8B6F2E, #C9A96E, #E0BC52)',
            borderRadius: 4,
            boxShadow: '0 0 16px rgba(201,169,110,0.5)',
            transition: 'height 1.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
        {sorted.map(m => {
          const achieved = achievedIds.has(m.id)
          const isNext = nextUpId === m.id
          const isFresh = freshMilestoneIds.has(m.id)
          return (
            <div
              key={m.id}
              style={{ position: 'relative', paddingLeft: 20, paddingBottom: 18, minHeight: 56 }}
              onClick={() => onMarkerClick(m)}
            >
              <div style={{ position: 'absolute', left: -18, top: 0 }}>
                <Marker
                  milestone={m}
                  achieved={achieved}
                  isNext={isNext}
                  isFresh={isFresh}
                  positionStyle={{}}
                  labelPosition="hidden"
                  achievement={achievements.find(a => a.milestoneId === m.id) ?? null}
                  onClick={() => onMarkerClick(m)}
                />
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: achieved ? '#fff' : isNext ? m.accentColor ?? '#C9A96E' : '#6B8299',
                marginBottom: 2,
              }}>
                {m.title}
              </div>
              <div style={{ fontSize: 11, color: '#6B8299' }}>
                {m.pointThreshold.toLocaleString()} points{m.tagline ? ` · ${m.tagline}` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Marker({
  milestone, achieved, isNext, isFresh, positionStyle, labelPosition, achievement, onClick,
}: {
  milestone: TrackMilestone
  achieved: boolean
  isNext: boolean
  isFresh: boolean
  positionStyle: React.CSSProperties
  labelPosition: 'below' | 'hidden'
  achievement: TrackAchievement | null
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const accent = milestone.accentColor ?? '#C9A96E'

  const size = 36
  const innerSize = 24

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        cursor: 'pointer',
        transition: 'transform 200ms ease',
        transform: hover ? 'scale(1.08)' : 'scale(1)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: achieved ? accent : 'rgba(255,255,255,0.04)',
          border: `2px solid ${achieved ? accent : isNext ? accent : 'rgba(255,255,255,0.2)'}`,
          boxShadow: achieved
            ? `0 0 16px ${accent}99`
            : isNext
              ? `0 0 0 0 ${accent}88`
              : 'none',
          animation: isNext
            ? 'climb-pulse 2.4s infinite'
            : isFresh
              ? 'climb-tick 600ms ease'
              : undefined,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: innerSize,
            height: innerSize,
            borderRadius: '50%',
            background: achieved ? '#0A1628' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: achieved ? accent : isNext ? accent : '#6B8299',
            fontWeight: 700,
          }}
        >
          {milestone.iconKey ?? (achieved ? '✓' : '·')}
        </div>
      </div>

      {labelPosition === 'below' && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            fontSize: 10,
            color: achieved ? '#fff' : isNext ? accent : '#6B8299',
            fontWeight: achieved || isNext ? 600 : 400,
          }}
        >
          <div>{milestone.pointThreshold.toLocaleString()}</div>
          {achievement && (
            <div style={{ fontSize: 9, color: '#6B8299', marginTop: 1 }}>
              {new Date(achievement.achievedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
      )}

      {hover && labelPosition === 'below' && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 12px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#142D48',
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: '8px 12px',
            minWidth: 180,
            maxWidth: 240,
            boxShadow: `0 8px 24px rgba(0,0,0,0.4)`,
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            {milestone.title}
          </div>
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.4 }}>
            {milestone.tagline ?? milestone.description ?? `${milestone.pointThreshold.toLocaleString()} points`}
          </div>
        </div>
      )}
    </div>
  )
}
