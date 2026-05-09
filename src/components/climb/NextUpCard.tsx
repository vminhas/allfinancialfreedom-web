'use client'

import type { TrackMilestone } from './ClimbTrack'

// 'Next milestone' card with a mini progress ring. Animated stroke
// fill on mount via SVG stroke-dashoffset transition. The whole card
// has a slow gradient sweep across its border for the ambient
// liveliness, mirroring Twitch overlay cards.

export default function NextUpCard({
  next,
  totalPoints,
  previousThreshold,
}: {
  next: TrackMilestone | null
  totalPoints: number
  previousThreshold: number
}) {
  if (!next) {
    return (
      <div style={cardStyle('rgba(255,215,0,0.3)')}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#FFD700', textAlign: 'center', padding: '24px 16px' }}>
          🏔️ Summit reached. You&apos;ve hit every milestone on the Climb. Set new records.
        </div>
      </div>
    )
  }

  const accent = next.accentColor ?? '#C9A96E'
  const remaining = Math.max(0, next.pointThreshold - totalPoints)
  // Progress through THIS milestone's segment (from previous threshold to this one).
  const segmentSize = Math.max(1, next.pointThreshold - previousThreshold)
  const segmentProgress = Math.max(0, totalPoints - previousThreshold)
  const ringPct = Math.min(100, (segmentProgress / segmentSize) * 100)

  const ringRadius = 36
  const ringCircumference = 2 * Math.PI * ringRadius
  const dashOffset = ringCircumference * (1 - ringPct / 100)

  return (
    <div style={cardStyle(`${accent}66`)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 22, position: 'relative', zIndex: 1 }}>
        {/* Mini progress ring */}
        <svg width={88} height={88} style={{ flexShrink: 0 }}>
          <circle cx={44} cy={44} r={ringRadius} stroke="rgba(255,255,255,0.06)" strokeWidth={6} fill="none" />
          <circle
            cx={44}
            cy={44}
            r={ringRadius}
            stroke={accent}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={ringCircumference}
            strokeDashoffset={dashOffset}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: 'center',
              transition: 'stroke-dashoffset 1.6s cubic-bezier(0.16, 1, 0.3, 1)',
              filter: `drop-shadow(0 0 6px ${accent}66)`,
            }}
          />
          <text
            x={44}
            y={44}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={16}
            fontWeight={700}
            fill="#fff"
            fontFamily="system-ui"
          >
            {Math.round(ringPct)}%
          </text>
          <text
            x={44}
            y={60}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={8}
            fill="#9BB0C4"
            fontFamily="system-ui"
            letterSpacing="0.1em"
          >
            TO NEXT
          </text>
        </svg>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, marginBottom: 4 }}>
            Next on the Climb
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4, lineHeight: 1.2 }}>
            {next.title}
          </div>
          <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.5, marginBottom: 8 }}>
            {next.tagline ?? next.description ?? ''}
          </div>
          <div style={{ fontSize: 11, color: '#6B8299' }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>{remaining.toLocaleString()}</span> points to go ({totalPoints.toLocaleString()} / {next.pointThreshold.toLocaleString()})
          </div>
        </div>
      </div>
    </div>
  )
}

function cardStyle(borderColor: string): React.CSSProperties {
  return {
    position: 'relative',
    borderRadius: 10,
    border: `1px solid ${borderColor}`,
    background: 'linear-gradient(135deg, rgba(20,45,72,0.6), rgba(10,22,40,0.6))',
    overflow: 'hidden',
    // Animated gradient border sweep — the lively touch.
    backgroundImage: `linear-gradient(135deg, rgba(20,45,72,0.6), rgba(10,22,40,0.6)), linear-gradient(110deg, transparent 30%, ${borderColor} 50%, transparent 70%)`,
    backgroundOrigin: 'border-box',
    backgroundClip: 'padding-box, border-box',
  }
}
