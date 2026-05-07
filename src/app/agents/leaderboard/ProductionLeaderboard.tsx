'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  TrophyIcon, CrownIcon, MedalIcon,
  SubmissionIcon, RecruitsIcon, PointsIcon,
  GlobeIcon, DownlineIcon,
  TrendUpIcon, TrendDownIcon, DashIcon,
  EmptyChartIcon,
} from './leaderboard-icons'

// Production leaderboard. Premium-themed counterpart to the existing
// onboarding-progress matrix. Three metrics, two scopes, five timeframes.
// Top-3 podium for motivation, full ranking table below, viewer-standing
// banner at the top so even a #200-ranked agent reads as oriented rather
// than buried.

type Metric = 'submissions' | 'recruits' | 'points'
type Scope = 'company' | 'downline'
type Timeframe = 'week' | 'month' | 'quarter' | 'ytd' | 'all'

interface Row {
  agentProfileId: string
  agentCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  phase: number
  upline: string | null
  value: number
  rank: number
}

interface Payload {
  rows: Row[]
  viewer: { agentProfileId: string; rank: number | null; value: number; previousValue: number }
  totalCount: number
  metric: Metric
  scope: Scope
  timeframe: Timeframe
}

const PHASE_COLORS: Record<number, string> = {
  1: '#60a5fa', 2: '#4ade80', 3: '#C9A96E', 4: '#a78bfa', 5: '#f472b6',
}

const METRIC_LABEL: Record<Metric, string> = {
  submissions: 'Submissions',
  recruits: 'Recruits',
  points: 'Points',
}

const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
  ytd: 'Year to Date',
  all: 'All Time',
}

// Podium accents tuned for AFF's dark navy. Gold reuses the brand
// `#C9A96E`; silver and bronze are slightly desaturated so all three
// chips read as a coherent set rather than three disparate hues.
const PODIUM_ACCENT: Record<1 | 2 | 3, { ring: string; glow: string; gem: string; label: string }> = {
  1: { ring: '#C9A96E', glow: 'rgba(201,169,110,0.35)', gem: '#FFE082', label: 'Gold' },
  2: { ring: '#C0C8D4', glow: 'rgba(192,200,212,0.30)', gem: '#E8EDF5', label: 'Silver' },
  3: { ring: '#B07A4A', glow: 'rgba(176,122,74,0.30)', gem: '#E0A77A', label: 'Bronze' },
}

export default function ProductionLeaderboard() {
  const isMobile = useIsMobile()
  const [metric, setMetric] = useState<Metric>('submissions')
  const [scope, setScope] = useState<Scope>('company')
  const [timeframe, setTimeframe] = useState<Timeframe>('month')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const url = `/api/agents/leaderboard/production?metric=${metric}&scope=${scope}&timeframe=${timeframe}`
    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<Payload>
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [metric, scope, timeframe])

  return (
    <div>
      <Header metric={metric} timeframe={timeframe} scope={scope} />
      <FilterBar
        metric={metric} setMetric={setMetric}
        scope={scope} setScope={setScope}
        timeframe={timeframe} setTimeframe={setTimeframe}
        isMobile={isMobile}
      />

      {loading && !data && <SkeletonState isMobile={isMobile} />}

      {error && <ErrorState message={error} />}

      {data && (
        <>
          <StandingBanner
            viewer={data.viewer}
            total={data.totalCount}
            metric={metric}
            timeframe={timeframe}
            scope={scope}
          />

          {data.rows.length === 0 ? (
            <EmptyState metric={metric} scope={scope} />
          ) : (
            <>
              <Podium rows={data.rows.slice(0, 3)} viewerId={data.viewer.agentProfileId} metric={metric} isMobile={isMobile} />
              <RankingTable rows={data.rows} viewerId={data.viewer.agentProfileId} metric={metric} isMobile={isMobile} />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────

function Header({ metric, timeframe, scope }: { metric: Metric; timeframe: Timeframe; scope: Scope }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color: '#C9A96E', display: 'inline-flex' }}>
          <TrophyIcon size={14} />
        </span>
        <span style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>
          Production Leaderboard
        </span>
      </div>
      <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0, lineHeight: 1.1 }}>
        {METRIC_LABEL[metric]} <span style={{ color: '#6B8299', fontWeight: 200 }}>&middot; {TIMEFRAME_LABEL[timeframe]}</span>
      </h1>
      <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
        {scope === 'company'
          ? 'Every active AFF agent ranked. Your row glows in gold.'
          : 'Your downline only. The further down the tree, the more rows you can grow this list to.'}
      </p>
    </div>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────

function FilterBar({
  metric, setMetric, scope, setScope, timeframe, setTimeframe, isMobile,
}: {
  metric: Metric; setMetric: (m: Metric) => void
  scope: Scope; setScope: (s: Scope) => void
  timeframe: Timeframe; setTimeframe: (t: Timeframe) => void
  isMobile: boolean
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 14,
      alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap',
      padding: '12px 14px', marginBottom: 16,
      background: 'linear-gradient(180deg, #142D48 0%, #0F2440 100%)',
      borderRadius: 8, border: '1px solid rgba(201,169,110,0.15)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
    }}>
      <SegmentGroup label="Metric">
        <Segment active={metric === 'submissions'} onClick={() => setMetric('submissions')} icon={<SubmissionIcon size={13} />}>Submissions</Segment>
        <Segment active={metric === 'recruits'} onClick={() => setMetric('recruits')} icon={<RecruitsIcon size={13} />}>Recruits</Segment>
        <Segment active={metric === 'points'} onClick={() => setMetric('points')} icon={<PointsIcon size={13} />}>Points</Segment>
      </SegmentGroup>

      <Divider isMobile={isMobile} />

      <SegmentGroup label="Scope">
        <Segment active={scope === 'company'} onClick={() => setScope('company')} icon={<GlobeIcon size={13} />}>Company</Segment>
        <Segment active={scope === 'downline'} onClick={() => setScope('downline')} icon={<DownlineIcon size={13} />}>My Downline</Segment>
      </SegmentGroup>

      <Divider isMobile={isMobile} />

      <SegmentGroup label="Timeframe">
        {(['week', 'month', 'quarter', 'ytd', 'all'] as Timeframe[]).map(t => (
          <Segment key={t} active={timeframe === t} onClick={() => setTimeframe(t)}>
            {t === 'week' ? 'Week' : t === 'month' ? 'Month' : t === 'quarter' ? 'Qtr' : t === 'ytd' ? 'YTD' : 'All'}
          </Segment>
        ))}
      </SegmentGroup>
    </div>
  )
}

function SegmentGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 9, color: '#6B8299', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 0, padding: 2, background: 'rgba(0,0,0,0.25)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)' }}>
        {children}
      </div>
    </div>
  )
}

function Segment({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', fontSize: 11, fontWeight: active ? 700 : 500,
        color: active ? '#142D48' : '#9BB0C4',
        background: active ? 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)' : 'transparent',
        border: 'none', borderRadius: 4, cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px rgba(201,169,110,0.4)' : 'none',
        transition: 'background 0.15s, color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </button>
  )
}

function Divider({ isMobile }: { isMobile: boolean }) {
  if (isMobile) return null
  return <div style={{ width: 1, height: 22, background: 'rgba(201,169,110,0.15)' }} />
}

// ─── Standing banner ──────────────────────────────────────────────────

function StandingBanner({
  viewer, total, metric, timeframe, scope,
}: {
  viewer: { rank: number | null; value: number; previousValue: number }
  total: number
  metric: Metric
  timeframe: Timeframe
  scope: Scope
}) {
  const delta = viewer.value - viewer.previousValue
  const Trend = delta > 0 ? TrendUpIcon : delta < 0 ? TrendDownIcon : DashIcon
  const trendColor = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#6B8299'
  const showDelta = timeframe !== 'all'
  const valueLabel = formatValue(viewer.value, metric)
  const prevLabel = formatValue(Math.abs(delta), metric)

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '14px 18px', marginBottom: 18,
      background: 'linear-gradient(135deg, rgba(201,169,110,0.10) 0%, rgba(201,169,110,0.02) 100%)',
      border: '1px solid rgba(201,169,110,0.25)', borderRadius: 8,
      boxShadow: '0 0 0 1px rgba(201,169,110,0.08) inset',
    }}>
      {/* Soft gold radial glow in the bottom-right that gives the banner
          a "spotlight" feel without being distracting. */}
      <div style={{
        position: 'absolute', right: -40, bottom: -40, width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(201,169,110,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 10, color: '#C9A96E', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
            Your standing
          </div>
          <div style={{ fontSize: 20, color: '#ffffff', fontWeight: 300, marginTop: 4, letterSpacing: '-0.01em' }}>
            {viewer.rank
              ? <>You&apos;re <span style={{ color: '#C9A96E', fontWeight: 600 }}>#{viewer.rank}</span> of <span style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</span></>
              : <>You haven&apos;t logged a {metric === 'recruits' ? 'recruit' : 'submission'} {timeframe === 'all' ? 'yet' : timeframeShort(timeframe)}</>
            }
          </div>
          <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 4 }}>
            {valueLabel} {METRIC_LABEL[metric].toLowerCase()} &middot; {scope === 'company' ? 'Company-wide' : 'Within your downline'}
          </div>
        </div>

        {showDelta && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.25)', borderRadius: 6,
            border: `1px solid ${delta !== 0 ? trendColor : 'rgba(255,255,255,0.06)'}33`,
          }}>
            <span style={{ color: trendColor, display: 'inline-flex' }}>
              <Trend size={16} />
            </span>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 13, color: trendColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {delta === 0 ? 'No change' : `${delta > 0 ? '+' : '-'}${prevLabel}`}
              </div>
              <div style={{ fontSize: 9, color: '#6B8299', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                vs previous {timeframe === 'week' ? 'week' : timeframe === 'month' ? 'month' : timeframe === 'quarter' ? 'quarter' : 'year'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function timeframeShort(tf: Timeframe): string {
  return tf === 'week' ? 'this week' : tf === 'month' ? 'this month' : tf === 'quarter' ? 'this quarter' : 'this year'
}

// ─── Podium ───────────────────────────────────────────────────────────

function Podium({ rows, viewerId, metric, isMobile }: { rows: Row[]; viewerId: string; metric: Metric; isMobile: boolean }) {
  // Visually re-order so #1 sits in the middle, #2 left, #3 right —
  // standard medals-podium layout (Olympic-style). On mobile we stack
  // vertically by rank since the visual centering doesn't read in a
  // narrow column.
  const desktopOrder = [rows[1], rows[0], rows[2]].filter(Boolean) as Row[]
  const ordered = isMobile ? rows : desktopOrder

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : `repeat(${ordered.length}, 1fr)`,
      gap: 12, marginBottom: 18,
      alignItems: 'end',
    }}>
      {ordered.map(row => (
        <PodiumCard key={row.agentProfileId} row={row} viewerId={viewerId} metric={metric} isMobile={isMobile} />
      ))}
    </div>
  )
}

function PodiumCard({ row, viewerId, metric, isMobile }: { row: Row; viewerId: string; metric: Metric; isMobile: boolean }) {
  const place = (row.rank === 1 ? 1 : row.rank === 2 ? 2 : 3) as 1 | 2 | 3
  const accent = PODIUM_ACCENT[place]
  const isYou = row.agentProfileId === viewerId
  // Crown for #1, medals for #2/#3. Crown is bigger because it's the
  // only one — drives the eye to the center column on desktop.
  const Marker = place === 1 ? CrownIcon : MedalIcon
  // Visual height stagger so #1 sits taller than #2/#3 on desktop.
  const extraPad = isMobile ? 0 : place === 1 ? 14 : place === 2 ? 8 : 0

  return (
    <div style={{
      position: 'relative',
      padding: `${20 + extraPad}px 16px 16px`,
      background: `linear-gradient(180deg, rgba(201,169,110,0.04) 0%, rgba(20,45,72,0.6) 100%)`,
      border: `1px solid ${accent.ring}55`,
      borderTop: `2px solid ${accent.ring}`,
      borderRadius: 10,
      boxShadow: `0 0 24px ${accent.glow}, 0 1px 0 rgba(255,255,255,0.05) inset`,
      textAlign: 'center',
      overflow: 'hidden',
    }}>
      {/* Soft top-edge glow that traces the medal color along the border */}
      <div style={{
        position: 'absolute', top: -1, left: 0, right: 0, height: 60,
        background: `radial-gradient(ellipse at top, ${accent.ring}22 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: accent.ring, marginBottom: 10 }}>
          {place === 1
            ? <Marker size={36} gemColor={accent.gem} />
            : <MedalIcon size={28} ribbonColor={accent.ring} />
          }
        </div>

        <div style={{
          fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          color: accent.ring, marginBottom: 8,
        }}>
          {place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'} &middot; {accent.label}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <Avatar firstName={row.firstName} lastName={row.lastName} avatarUrl={row.avatarUrl} size={44} ringColor={isYou ? '#C9A96E' : `${accent.ring}55`} />
        </div>

        <div style={{ fontSize: 14, color: '#ffffff', fontWeight: 600, marginBottom: 2, lineHeight: 1.15 }}>
          {row.firstName} {row.lastName}
          {isYou && <YouBadge />}
        </div>
        <div style={{ fontSize: 10, color: '#6B8299', letterSpacing: '0.05em', marginBottom: 10 }}>
          {row.agentCode} &middot; <span style={{ color: PHASE_COLORS[row.phase] ?? '#6B8299' }}>Phase {row.phase}</span>
        </div>

        <div style={{
          padding: '8px 0',
          borderTop: `1px solid ${accent.ring}22`,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: accent.ring, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {formatValue(row.value, metric)}
          </div>
          <div style={{ fontSize: 9, color: '#6B8299', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600, marginTop: 4 }}>
            {METRIC_LABEL[metric]}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Ranking table ────────────────────────────────────────────────────

function RankingTable({ rows, viewerId, metric, isMobile }: { rows: Row[]; viewerId: string; metric: Metric; isMobile: boolean }) {
  // Skip the top 3 — they're already in the podium. Show ranks 4+ here.
  const tableRows = rows.length > 3 ? rows.slice(3) : []
  if (tableRows.length === 0) return null

  return (
    <div style={{
      background: '#142D48', borderRadius: 8,
      border: '1px solid rgba(201,169,110,0.12)',
      overflow: 'hidden',
    }}>
      {!isMobile && (
        <div style={{
          display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px 110px 1fr',
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.2)',
          borderBottom: '1px solid rgba(201,169,110,0.12)',
          fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, color: '#6B8299',
        }}>
          <div>Rank</div>
          <div>Agent</div>
          <div>Code</div>
          <div>Phase</div>
          <div style={{ textAlign: 'right' }}>{METRIC_LABEL[metric]}</div>
          <div>Upline</div>
        </div>
      )}
      {tableRows.map(row => (
        <RankRow key={row.agentProfileId} row={row} viewerId={viewerId} metric={metric} isMobile={isMobile} />
      ))}
    </div>
  )
}

function RankRow({ row, viewerId, metric, isMobile }: { row: Row; viewerId: string; metric: Metric; isMobile: boolean }) {
  const isYou = row.agentProfileId === viewerId
  const phaseColor = PHASE_COLORS[row.phase] ?? '#6B8299'

  if (isMobile) {
    return (
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: isYou ? 'rgba(201,169,110,0.08)' : 'transparent',
        borderLeft: isYou ? '3px solid #C9A96E' : '3px solid transparent',
      }}>
        <div style={{ minWidth: 30, textAlign: 'right', fontSize: 13, fontWeight: 700, color: row.rank <= 10 ? '#C9A96E' : '#6B8299', fontVariantNumeric: 'tabular-nums' }}>
          {row.rank}
        </div>
        <Avatar firstName={row.firstName} lastName={row.lastName} avatarUrl={row.avatarUrl} size={32} ringColor={isYou ? '#C9A96E' : 'transparent'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: isYou ? 700 : 500, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.firstName} {row.lastName}
            {isYou && <YouBadge />}
          </div>
          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
            <span style={{ color: phaseColor }}>Phase {row.phase}</span> &middot; {row.agentCode}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#C9A96E', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {formatValue(row.value, metric)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px 110px 1fr',
      padding: '10px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: isYou ? 'rgba(201,169,110,0.08)' : 'transparent',
      borderLeft: isYou ? '3px solid #C9A96E' : '3px solid transparent',
      alignItems: 'center',
      transition: 'background 0.12s',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: row.rank <= 10 ? '#C9A96E' : '#6B8299', fontVariantNumeric: 'tabular-nums' }}>
        #{row.rank}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar firstName={row.firstName} lastName={row.lastName} avatarUrl={row.avatarUrl} size={28} ringColor={isYou ? '#C9A96E' : 'transparent'} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: isYou ? 700 : 500, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.firstName} {row.lastName}
            {isYou && <YouBadge />}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#9BB0C4', fontVariantNumeric: 'tabular-nums' }}>{row.agentCode}</div>
      <div>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 3,
          background: `${phaseColor}18`, border: `1px solid ${phaseColor}40`,
          fontSize: 10, fontWeight: 700, color: phaseColor, letterSpacing: '0.05em',
        }}>
          {row.phase}
        </span>
      </div>
      <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 700, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>
        {formatValue(row.value, metric)}
      </div>
      <div style={{ fontSize: 11, color: '#6B8299', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.upline ?? <span style={{ color: '#3F4B5C' }}>&mdash;</span>}
      </div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, avatarUrl, size = 24, ringColor = 'transparent' }: {
  firstName: string; lastName: string; avatarUrl: string | null; size?: number; ringColor?: string
}) {
  const initials = (firstName?.[0] ?? '?') + (lastName?.[0] ?? '')
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
          boxShadow: ringColor !== 'transparent' ? `0 0 0 2px ${ringColor}` : 'none',
        }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #1F3757 0%, #2D4A6E 100%)',
      color: '#C9A96E', fontSize: Math.max(9, size * 0.38), fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      boxShadow: ringColor !== 'transparent' ? `0 0 0 2px ${ringColor}` : 'none',
    }}>
      {initials.toUpperCase()}
    </div>
  )
}

function YouBadge() {
  return (
    <span style={{
      marginLeft: 6, fontSize: 8,
      color: '#C9A96E', padding: '1px 6px',
      background: 'rgba(201,169,110,0.18)',
      border: '1px solid rgba(201,169,110,0.4)',
      borderRadius: 3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em',
    }}>You</span>
  )
}

// ─── States ───────────────────────────────────────────────────────────

function SkeletonState({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: '#6B8299', fontSize: 12 }}>
      Loading rankings{!isMobile && '...'}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      padding: 20, background: 'rgba(248,113,113,0.08)',
      border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6,
      color: '#fca5a5', fontSize: 12,
    }}>
      Couldn&apos;t load the leaderboard: {message}
    </div>
  )
}

function EmptyState({ metric, scope }: { metric: Metric; scope: Scope }) {
  const cta = metric === 'recruits'
    ? { label: 'View recruiting tools', href: '/agents' }
    : { label: 'Log a new submission', href: '/agents/new-business' }
  return (
    <div style={{
      padding: '40px 24px', textAlign: 'center',
      background: '#142D48', borderRadius: 8,
      border: '1px solid rgba(201,169,110,0.12)',
    }}>
      <div style={{ display: 'inline-flex', color: '#3F4B5C', marginBottom: 12 }}>
        <EmptyChartIcon size={48} />
      </div>
      <div style={{ color: '#9BB0C4', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
        {scope === 'downline'
          ? 'No activity from your downline yet'
          : `No ${metric === 'recruits' ? 'recruits' : 'submissions'} logged yet`}
      </div>
      <div style={{ color: '#6B8299', fontSize: 12, marginBottom: 16, maxWidth: 360, margin: '0 auto 16px' }}>
        {scope === 'downline'
          ? 'Recruits you bring on will appear in this view as they ramp up.'
          : 'Be the first to put points on the board for this period.'}
      </div>
      <Link href={cta.href} style={{
        display: 'inline-block',
        padding: '8px 18px',
        background: 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)',
        color: '#142D48', fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.12em',
        borderRadius: 4, textDecoration: 'none',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      }}>
        {cta.label}
      </Link>
    </div>
  )
}

// ─── Formatting ───────────────────────────────────────────────────────

function formatValue(v: number, metric: Metric): string {
  // Submissions and recruits are integers; points are typically fractional
  // (carrier-weighted floats). Format accordingly so the columns line up.
  if (metric === 'points') {
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
  }
  return Math.round(v).toLocaleString()
}
