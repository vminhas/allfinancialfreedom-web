'use client'

import { useState, useEffect } from 'react'
import { AgentTradingCardModal } from '@/components/AgentTradingCard'

type Metric = 'submissions' | 'recruits' | 'points'
type Timeframe = 'week' | 'month' | 'quarter' | 'ytd' | 'all'

interface Row {
  agentProfileId: string
  agentCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  phase: number
  title: string
  upline: string | null
  value: number
  rank: number
}

interface Payload {
  rows: Row[]
  metric: Metric
  timeframe: Timeframe
  totalCount: number
  activeCount: number
}

const PHASE_COLORS: Record<number, string> = {
  1: '#60a5fa', 2: '#4ade80', 3: '#C9A96E', 4: '#a78bfa', 5: '#f472b6',
}

function titleAbbrev(title: string): string {
  if (title === 'Marketing Director') return 'MD'
  if (title === 'Executive Marketing Director') return 'EMD'
  if (title === 'Senior Associate') return 'Sr. Assoc'
  return title
}

const METRIC_LABELS: Record<Metric, string> = {
  submissions: 'Submissions', recruits: 'Recruits', points: 'Points',
}
const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  week: 'This Week', month: 'This Month', quarter: 'This Quarter', ytd: 'Year to Date', all: 'All Time',
}

function formatValue(v: number, metric: Metric) {
  if (metric === 'points') return v.toLocaleString()
  return String(v)
}

function Avatar({ firstName, lastName, avatarUrl, size }: { firstName: string; lastName: string; avatarUrl: string | null; size: number }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={`${firstName} ${lastName}`} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  }
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1F3757', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, color: '#6B8299' }}>
      {initials}
    </div>
  )
}

const selectStyle = {
  background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)',
  borderRadius: 4, color: '#9BB0C4', padding: '7px 12px', fontSize: 12,
}

export default function VaultLeaderboardPage() {
  const [metric, setMetric] = useState<Metric>('submissions')
  const [timeframe, setTimeframe] = useState<Timeframe>('month')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [cardCode, setCardCode] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/leaderboard?metric=${metric}&timeframe=${timeframe}`)
      .then(r => r.json())
      .then((d: Payload) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [metric, timeframe])

  const rows = data?.rows ?? []

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(16px, 3vw, 32px)' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          All Financial Freedom
        </div>
        <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Production Leaderboard
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
          {data ? `${data.activeCount} agents on the board · ${data.totalCount} total active` : 'Loading...'}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <select style={selectStyle} value={metric} onChange={e => setMetric(e.target.value as Metric)}>
          <option value="submissions">Submissions</option>
          <option value="recruits">Recruits</option>
          <option value="points">Points</option>
        </select>
        <select style={selectStyle} value={timeframe} onChange={e => setTimeframe(e.target.value as Timeframe)}>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
          <option value="ytd">Year to Date</option>
          <option value="all">All Time</option>
        </select>
        {data && !loading && (
          <span style={{ fontSize: 11, color: '#6B8299', marginLeft: 'auto' }}>
            {METRIC_LABELS[metric]} · {TIMEFRAME_LABELS[timeframe]}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>
          No activity for this period.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'rgba(12,30,48,0.8)' }}>
                {['Rank', 'Agent', 'Title', 'Upline', METRIC_LABELS[metric]].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', borderBottom: '1px solid rgba(201,169,110,0.1)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const phaseColor = PHASE_COLORS[row.phase] ?? '#6B8299'
                return (
                  <tr
                    key={row.agentProfileId}
                    onClick={() => setCardCode(row.agentCode)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,169,110,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: row.rank <= 3 ? '#C9A96E' : '#6B8299', fontVariantNumeric: 'tabular-nums' }}>
                        #{row.rank}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar firstName={row.firstName} lastName={row.lastName} avatarUrl={row.avatarUrl} size={32} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>
                            {row.firstName} {row.lastName}
                          </div>
                          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 1 }}>{row.agentCode}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 3, background: `${phaseColor}18`, border: `1px solid ${phaseColor}40`, fontSize: 10, fontWeight: 700, color: phaseColor, whiteSpace: 'nowrap' }}>
                        {titleAbbrev(row.title)}
                      </span>
                      <div style={{ fontSize: 10, color: '#6B8299', marginTop: 3 }}>{row.title}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B8299' }}>
                      {row.upline ?? <span style={{ color: '#3F4B5C' }}>&mdash;</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>
                        {formatValue(row.value, metric)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {cardCode && (
        <AgentTradingCardModal agentCode={cardCode} onClose={() => setCardCode(null)} />
      )}
    </div>
  )
}
