'use client'

import { useState, useEffect, useCallback } from 'react'

// Contest banner. Stacks at the top of the agent dashboard above
// tabs. Expandable per-contest to show requirement breakdown.
// Live ticking countdown updates every minute (cheap, no setState
// thrash because it only runs when the panel is mounted).

interface RequirementStatus {
  requirementId: string
  label: string
  type: 'PHASE_ITEM' | 'MILESTONE' | 'RECRUITS' | 'POLICIES' | 'MANUAL' | 'CUSTOM_TEXT'
  completed: boolean
  current?: number
  target?: number
}

interface ContestStatus {
  contestId: string
  title: string
  description: string | null
  rewardAmount: number | null
  rewardLabel: string | null
  startsAt: string
  endsAt: string
  daysRemaining: number
  millisRemaining: number
  expired: boolean
  notStartedYet: boolean
  requirements: RequirementStatus[]
  completedCount: number
  totalCount: number
  qualified: boolean
}

export default function ContestBanner({ previewToken }: { previewToken?: string | null }) {
  const [contests, setContests] = useState<ContestStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    const url = previewToken
      ? `/api/agents/contests?preview=${previewToken}`
      : '/api/agents/contests'
    const res = await fetch(url)
    if (res.ok) {
      const d = await res.json() as { contests: ContestStatus[] }
      // Hide expired or not-yet-started contests from the banner —
      // those go into a "Past bonuses" surface elsewhere if we want
      // them.
      setContests(d.contests.filter(c => !c.expired && !c.notStartedYet))
    }
    setLoading(false)
  }, [previewToken])

  useEffect(() => { load() }, [load])

  // Tick every minute so the countdown stays fresh without a full
  // refetch. Only triggers a re-render of the banner.
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading || contests.length === 0) return null

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {contests.map(c => {
        const isExpanded = expanded.has(c.contestId)
        const reward = c.rewardLabel
          ?? (c.rewardAmount != null ? `$${c.rewardAmount.toLocaleString()}` : '')
        const ms = c.millisRemaining + (tick - tick) // tick ref
        const remaining = liveRemaining(c.endsAt)
        const urgent = c.daysRemaining <= 7 && !c.qualified
        const fillPct = Math.round((c.completedCount / Math.max(1, c.totalCount)) * 100)

        return (
          <div key={c.contestId} style={{
            background: c.qualified
              ? 'linear-gradient(135deg, rgba(74,222,128,0.10), rgba(74,222,128,0.04))'
              : urgent
                ? 'linear-gradient(135deg, rgba(248,113,113,0.12), rgba(248,113,113,0.04))'
                : 'linear-gradient(135deg, rgba(201,169,110,0.10), rgba(201,169,110,0.04))',
            border: c.qualified
              ? '1px solid rgba(74,222,128,0.3)'
              : urgent
                ? '1px solid rgba(248,113,113,0.35)'
                : '1px solid rgba(201,169,110,0.3)',
            borderRadius: 8,
            overflow: 'hidden',
            transition: 'box-shadow 200ms',
          }}>
            <button
              onClick={() => toggleExpand(c.contestId)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'inherit', textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
                {c.qualified ? '✓' : urgent ? '🚨' : '🏆'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                    {reward && <span style={{ color: c.qualified ? '#4ade80' : '#C9A96E' }}>{reward}</span>}
                    {reward && ' · '}{c.title}
                  </span>
                  {c.qualified ? (
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4ade80' }}>
                      Earned
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: urgent ? '#f87171' : '#9BB0C4',
                    }}>
                      {remaining}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <div style={{
                    flex: 1, height: 4, background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4, overflow: 'hidden', maxWidth: 320,
                  }}>
                    <div style={{
                      width: `${fillPct}%`, height: '100%',
                      background: c.qualified ? '#4ade80' : urgent ? '#f87171' : '#C9A96E',
                      transition: 'width 600ms ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#9BB0C4', fontWeight: 600 }}>
                    {c.completedCount}/{c.totalCount} done
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#9BB0C4', flexShrink: 0 }}>
                {isExpanded ? '▲' : '▼'}
              </span>
            </button>

            {isExpanded && (
              <div style={{ padding: '4px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {c.description && (
                  <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.55, padding: '12px 0' }}>
                    {c.description}
                  </div>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {c.requirements.map(r => (
                    <li key={r.requirementId} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 4,
                      background: r.completed ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                      border: r.completed ? '1px solid rgba(74,222,128,0.25)' : '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        background: r.completed ? '#4ade80' : 'transparent',
                        color: r.completed ? '#0A1628' : '#6B8299',
                        border: r.completed ? 'none' : '1px solid rgba(255,255,255,0.2)',
                      }}>
                        {r.completed ? '✓' : ''}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: r.completed ? '#fff' : '#9BB0C4' }}>
                        {r.label}
                      </span>
                      {r.target != null && (
                        <span style={{ fontSize: 11, color: '#6B8299' }}>
                          {r.current ?? 0} / {r.target}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function liveRemaining(endsAtIso: string): string {
  const ms = new Date(endsAtIso).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (days >= 2) return `${days}d ${hours}h left`
  if (days === 1) return `1d ${hours}h left`
  if (hours >= 1) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}
