'use client'

import { useEffect, useState } from 'react'

// Org-wide recent achievements ticker. Polls /api/agents/climb every
// 60s while the Climb tab is open, slides new entries in from the
// right. Builds peer-pressure FOMO without being shouty.

interface ActivityRow {
  id: string
  achievedAt: string
  agentFirstName: string
  agentLastName: string
  agentCode: string
  avatarUrl: string | null
  milestoneTitle: string
  pointThreshold: number
  accentColor: string | null
}

export default function LiveActivityTicker({ activity }: { activity: ActivityRow[] }) {
  if (activity.length === 0) {
    return (
      <div style={{
        padding: '14px 18px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        fontSize: 11,
        color: '#6B8299',
        textAlign: 'center',
      }}>
        No recent achievements across the team yet. Be first.
      </div>
    )
  }

  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10,
      }}>
        Live Activity · Across the Team
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {activity.slice(0, 6).map((a, idx) => (
          <ActivityRowItem key={a.id} row={a} delay={idx * 60} />
        ))}
      </div>
    </div>
  )
}

function ActivityRowItem({ row, delay }: { row: ActivityRow; delay: number }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const accent = row.accentColor ?? '#C9A96E'
  const ago = relativeTime(new Date(row.achievedAt))

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateX(0)' : 'translateX(20px)',
        transition: 'opacity 360ms ease, transform 360ms ease',
        fontSize: 11,
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: '#0A1628',
        flexShrink: 0,
        boxShadow: `0 0 6px ${accent}66`,
      }}>
        {row.agentFirstName.charAt(0)}{row.agentLastName.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0, color: '#9BB0C4' }}>
        <strong style={{ color: '#fff', fontWeight: 600 }}>{row.agentFirstName} {row.agentLastName.charAt(0)}.</strong>
        {' '}hit{' '}
        <strong style={{ color: accent, fontWeight: 600 }}>{row.milestoneTitle}</strong>
        {' '}({row.pointThreshold.toLocaleString()})
      </div>
      <span style={{ fontSize: 10, color: '#6B8299', flexShrink: 0 }}>{ago}</span>
    </div>
  )
}

function relativeTime(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
