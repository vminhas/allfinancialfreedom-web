'use client'

import { useEffect, useRef, useState } from 'react'
import ClimbCounter from './ClimbCounter'
import ClimbTrack, { type TrackMilestone, type TrackAchievement } from './ClimbTrack'
import NextUpCard from './NextUpCard'
import MilestoneDetailModal from './MilestoneDetailModal'
import LiveActivityTicker from './LiveActivityTicker'
import { climbTierFor } from '@/lib/climb-tier'

export interface ClimbArticle {
  id: string
  milestoneId: string | null
  title: string
  body: string
  generatedAt: string
}

interface ClimbActivity {
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

interface ClimbApiResponse {
  totalPoints: number
  milestones: TrackMilestone[]
  achievements: TrackAchievement[]
  articles: ClimbArticle[]
  recentActivity: ClimbActivity[]
}

const FRESH_KEY = 'aff-climb-seen-v1'

export default function ClimbTab({
  isMobile,
  previewToken,
}: {
  isMobile: boolean
  previewToken?: string | null
}) {
  const [data, setData] = useState<ClimbApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMilestone, setOpenMilestone] = useState<TrackMilestone | null>(null)
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const lastTotalRef = useRef<number>(0)

  const withPreview = (path: string) => previewToken
    ? `${path}${path.includes('?') ? '&' : '?'}preview=${previewToken}`
    : path

  const fetchData = async () => {
    try {
      const res = await fetch(withPreview('/api/agents/climb'))
      if (!res.ok) {
        setError('Failed to load Climb data')
        setLoading(false)
        return
      }
      const json = await res.json() as ClimbApiResponse
      setData(json)

      // Detect newly-earned milestones since the last render so we
      // can fire confetti + the climb-tick animation. Persist seen
      // IDs in localStorage so refreshing doesn't celebrate twice.
      const seenStr = previewToken ? '[]' : (localStorage.getItem(FRESH_KEY) ?? '[]')
      const seen = new Set<string>(JSON.parse(seenStr))
      const fresh = new Set<string>()
      for (const a of json.achievements) {
        if (!seen.has(a.milestoneId)) fresh.add(a.milestoneId)
      }
      if (fresh.size > 0 && !previewToken) {
        const all = [...seen, ...Array.from(fresh)]
        localStorage.setItem(FRESH_KEY, JSON.stringify(all))
      }
      setFreshIds(fresh)

      // Confetti for fresh milestones (skip on preview).
      if (fresh.size > 0 && !previewToken) {
        const fireConfetti = async () => {
          const confetti = (await import('canvas-confetti')).default
          const sortedFresh = json.achievements
            .filter(a => fresh.has(a.milestoneId))
            .sort((a, b) => a.pointsAtAchievement - b.pointsAtAchievement)
          let delay = 600
          for (const a of sortedFresh) {
            const m = json.milestones.find(x => x.id === a.milestoneId)
            const accent = m?.accentColor ?? '#C9A96E'
            setTimeout(() => {
              confetti({
                particleCount: 80,
                spread: 70,
                origin: { y: 0.4 },
                colors: [accent, '#ffffff', '#C9A96E'],
              })
              if ('vibrate' in navigator) navigator.vibrate(200)
            }, delay)
            delay += 900
          }
        }
        fireConfetti().catch(() => {})
      }

      lastTotalRef.current = json.totalPoints
      setLoading(false)
    } catch {
      setError('Network error')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Poll every 60s while the tab is mounted so live activity +
    // total points stay fresh without reloading.
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewToken])

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6B8299', fontSize: 13 }}>
        Loading the Climb...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#f87171', fontSize: 13 }}>
        {error || 'Could not load.'}
      </div>
    )
  }

  const tier = climbTierFor(data.achievements.length, data.milestones.length)
  const sorted = [...data.milestones].sort((a, b) => a.pointThreshold - b.pointThreshold)
  const achievedIds = new Set(data.achievements.map(a => a.milestoneId))
  const next = sorted.find(m => !achievedIds.has(m.id)) ?? null
  const previousThreshold = next
    ? (sorted.filter(m => m.pointThreshold < next.pointThreshold && achievedIds.has(m.id)).pop()?.pointThreshold ?? 0)
    : 0

  // Achievements list (most recent first, with milestone joined in)
  const achievementsWithMilestones = data.achievements
    .map(a => ({ a, m: data.milestones.find(m => m.id === a.milestoneId) }))
    .filter(x => x.m)
    .sort((x, y) => new Date(y.a.achievedAt).getTime() - new Date(x.a.achievedAt).getTime())

  return (
    <div style={{
      // Tier accent CSS variable. Children that want the live tier
      // color reference var(--climb-accent).
      ['--climb-accent' as string]: tier.accent,
    } as React.CSSProperties}>
      {/* Hero counter */}
      <div style={{
        marginBottom: 20,
        background: 'linear-gradient(180deg, rgba(20,45,72,0.5), rgba(10,22,40,0.2))',
        border: `1px solid ${tier.accent}33`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <ClimbCounter total={data.totalPoints} tier={tier} newlyAwarded={freshIds.size > 0} />
      </div>

      {/* The Track */}
      <div style={{
        marginBottom: 20,
        background: 'rgba(20,45,72,0.3)',
        border: '1px solid rgba(201,169,110,0.15)',
        borderRadius: 12,
      }}>
        <ClimbTrack
          totalPoints={data.totalPoints}
          milestones={data.milestones}
          achievements={data.achievements}
          isMobile={isMobile}
          freshMilestoneIds={freshIds}
          onMarkerClick={m => setOpenMilestone(m)}
        />
      </div>

      {/* Next-up card + activity ticker */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
        gap: 16,
        marginBottom: 20,
      }}>
        <NextUpCard next={next} totalPoints={data.totalPoints} previousThreshold={previousThreshold} />
        <LiveActivityTicker activity={data.recentActivity} />
      </div>

      {/* Achievements list */}
      {achievementsWithMilestones.length > 0 && (
        <div style={{
          background: 'rgba(20,45,72,0.3)',
          border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 12,
          padding: '20px 22px',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14,
          }}>
            Your Achievements
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {achievementsWithMilestones.map(({ a, m }) => {
              const article = data.articles.find(art => art.milestoneId === m!.id) ?? null
              const accent = m!.accentColor ?? '#C9A96E'
              return (
                <button
                  key={a.milestoneId}
                  onClick={() => setOpenMilestone(m!)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${accent}44`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 150ms, border-color 150ms, transform 150ms',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = `${accent}11`
                    e.currentTarget.style.borderColor = `${accent}88`
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    e.currentTarget.style.borderColor = `${accent}44`
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: '#0A1628', fontWeight: 700,
                    flexShrink: 0,
                    boxShadow: `0 0 12px ${accent}66`,
                  }}>
                    {m!.iconKey ?? '✓'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                      {m!.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#9BB0C4' }}>
                      {m!.pointThreshold.toLocaleString()} points · {new Date(a.achievedAt).toLocaleDateString()}
                      {article ? ' · 📰 article inside' : ''}
                    </div>
                  </div>
                  <span style={{ color: accent, fontSize: 14 }}>→</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {openMilestone && (
        <MilestoneDetailModal
          milestone={openMilestone}
          achievement={data.achievements.find(a => a.milestoneId === openMilestone.id) ?? null}
          article={data.articles.find(art => art.milestoneId === openMilestone.id) ?? null}
          totalPoints={data.totalPoints}
          onClose={() => setOpenMilestone(null)}
        />
      )}
    </div>
  )
}
