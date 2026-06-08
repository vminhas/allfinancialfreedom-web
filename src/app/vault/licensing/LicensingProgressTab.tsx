'use client'

import { useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface Agent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  state: string | null
  status: string
  examDate: string | null
  licenseNumber: string | null
  npn: string | null
  dateSubmittedToGfi: string | null
  email: string | null
  carriers: { total: number; appointed: number; pending: number; carriers: { carrier: string; status: string }[] }
}

interface Payload {
  agents: Agent[]
  items: string[]
  completedMap: Record<string, string>
}

const ITEM_LABELS: Record<string, string> = {
  licensing_class: 'Pre-licensing Course',
  pass_license_test: 'Pass License Exam',
  fingerprints_apply: 'Fingerprints + Apply',
  submit_to_aff: 'Submit to GFI',
  ce_courses: 'CE Courses',
  errors_and_omissions: 'E&O Insurance',
  fully_appointed: 'Carrier Appointed',
  direct_deposit: 'Direct Deposit',
}

const SHORT_LABELS: Record<string, string> = {
  licensing_class: 'Pre-License',
  pass_license_test: 'Pass Exam',
  fingerprints_apply: 'Fingerprints',
  submit_to_aff: 'GFI',
  ce_courses: 'CE',
  errors_and_omissions: 'E&O',
  fully_appointed: 'Appointed',
  direct_deposit: 'Direct Dep.',
}

export default function LicensingProgressTab() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'incomplete' | 'complete'>('all')
  const [sort, setSort] = useState<'progress' | 'name' | 'phase'>('progress')
  const [hover, setHover] = useState<{ agentId: string; itemKey: string } | null>(null)

  useEffect(() => {
    fetch('/api/vault/licensing-progress')
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<Payload>
      })
      .then(setData)
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const agentStats = useMemo(() => {
    if (!data) return new Map<string, { done: number; total: number; ratio: number }>()
    const m = new Map<string, { done: number; total: number; ratio: number }>()
    const total = data.items.length
    for (const a of data.agents) {
      let done = 0
      for (const k of data.items) {
        if (data.completedMap[`${a.id}:${k}`]) done++
      }
      m.set(a.id, { done, total, ratio: total > 0 ? done / total : 0 })
    }
    return m
  }, [data])

  const itemCompletionRate = useMemo(() => {
    if (!data) return new Map<string, number>()
    const m = new Map<string, number>()
    const agentCount = data.agents.length
    for (const k of data.items) {
      let done = 0
      for (const a of data.agents) {
        if (data.completedMap[`${a.id}:${k}`]) done++
      }
      m.set(k, agentCount > 0 ? done / agentCount : 0)
    }
    return m
  }, [data])

  const filteredAgents = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.agents
      .filter(a => {
        if (q) {
          const hay = `${a.firstName} ${a.lastName} ${a.agentCode}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (statusFilter === 'complete') {
          const s = agentStats.get(a.id)
          if (!s || s.ratio < 1) return false
        }
        if (statusFilter === 'incomplete') {
          const s = agentStats.get(a.id)
          if (s && s.ratio >= 1) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sort === 'name') return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
        if (sort === 'phase') {
          if (a.phase !== b.phase) return b.phase - a.phase
          return (agentStats.get(b.id)?.ratio ?? 0) - (agentStats.get(a.id)?.ratio ?? 0)
        }
        const ra = agentStats.get(a.id)?.ratio ?? 0
        const rb = agentStats.get(b.id)?.ratio ?? 0
        if (ra !== rb) return ra - rb
        return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
      })
  }, [data, search, statusFilter, sort, agentStats])

  const aggregate = useMemo(() => {
    if (!data) return { agents: 0, fullyLicensed: 0, avgPct: 0, totalCarriersAppointed: 0 }
    let fullyLicensed = 0
    let totalDone = 0
    let totalPossible = 0
    let totalCarriersAppointed = 0
    for (const a of data.agents) {
      const s = agentStats.get(a.id)
      if (s) {
        totalDone += s.done
        totalPossible += s.total
        if (s.ratio >= 1) fullyLicensed++
      }
      totalCarriersAppointed += a.carriers.appointed
    }
    return {
      agents: data.agents.length,
      fullyLicensed,
      avgPct: totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0,
      totalCarriersAppointed,
    }
  }, [data, agentStats])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#6B8299', fontSize: 13 }}>Loading licensing progress...</div>
  )
  if (error) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#f87171', fontSize: 13 }}>Could not load data: {error}</div>
  )
  if (!data) return null

  return (
    <div>
      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 10, marginBottom: 14,
      }}>
        <StatCard label="Active agents" value={aggregate.agents.toString()} />
        <StatCard label="Fully licensed" value={aggregate.fullyLicensed.toString()} accent="#4ADE80" />
        <StatCard label="Avg completion" value={`${aggregate.avgPct}%`} accent="#C9A96E" />
        <StatCard label="Carrier appointments" value={aggregate.totalCarriersAppointed.toString()} />
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        marginBottom: 16, padding: '10px 14px',
        background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
      }}>
        <input
          type="search"
          placeholder="Search agent..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: '#0A1628', color: '#ffffff',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, padding: '6px 10px', fontSize: 12,
            width: isMobile ? '100%' : 180,
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{
            background: '#0A1628', color: '#9BB0C4',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, padding: '6px 10px', fontSize: 12,
          }}
        >
          <option value="all">All agents</option>
          <option value="incomplete">Incomplete only</option>
          <option value="complete">Fully licensed</option>
        </select>
        <div style={{ flex: 1 }} />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as typeof sort)}
          style={{
            background: '#0A1628', color: '#9BB0C4',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, padding: '6px 10px', fontSize: 12,
          }}
        >
          <option value="progress">Sort: Least progress</option>
          <option value="phase">Sort: Phase</option>
          <option value="name">Sort: Name (A-Z)</option>
        </select>
      </div>

      {/* Item completion bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `200px repeat(${data.items.length}, 1fr) 80px`,
        gap: 0, marginBottom: 2,
        padding: '8px 0',
        background: 'rgba(201,169,110,0.04)',
        borderRadius: '6px 6px 0 0',
        border: '1px solid rgba(201,169,110,0.1)',
        borderBottom: 'none',
      }}>
        <div style={{ padding: '0 12px', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', display: 'flex', alignItems: 'center' }}>
          Roster Rate
        </div>
        {data.items.map(k => {
          const rate = itemCompletionRate.get(k) ?? 0
          const pct = Math.round(rate * 100)
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0' }}>
              <div style={{ fontSize: 9, color: '#C9A96E', fontWeight: 600 }}>{pct}%</div>
              <div style={{ width: '70%', height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#C9A96E', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            </div>
          )
        })}
        <div />
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `200px repeat(${data.items.length}, 1fr) 80px`,
        gap: 0,
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.1)',
        borderBottom: '2px solid rgba(201,169,110,0.15)',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <div style={{ padding: '10px 12px', fontSize: 10, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Agent
        </div>
        {data.items.map(k => (
          <div key={k} style={{
            padding: '10px 4px', textAlign: 'center',
            fontSize: 9, fontWeight: 600, color: '#9BB0C4',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            borderLeft: '1px solid rgba(255,255,255,0.04)',
          }}>
            {isMobile ? SHORT_LABELS[k] : ITEM_LABELS[k]}
          </div>
        ))}
        <div style={{
          padding: '10px 4px', textAlign: 'center',
          fontSize: 9, fontWeight: 600, color: '#9BB0C4',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          borderLeft: '1px solid rgba(201,169,110,0.15)',
        }}>
          Carriers
        </div>
      </div>

      {/* Agent rows */}
      {filteredAgents.length === 0 && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: '#6B8299', fontSize: 13,
          background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderTop: 'none', borderRadius: '0 0 6px 6px',
        }}>
          No agents match the current filters.{' '}
          <button
            onClick={() => { setSearch(''); setStatusFilter('all') }}
            style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            Clear filters
          </button>
        </div>
      )}
      {filteredAgents.map((a, rowIdx) => {
        const stats = agentStats.get(a.id) ?? { done: 0, total: 0, ratio: 0 }
        const pct = Math.round(stats.ratio * 100)
        const isFullyLicensed = stats.ratio >= 1
        return (
          <div
            key={a.id}
            style={{
              display: 'grid',
              gridTemplateColumns: `200px repeat(${data.items.length}, 1fr) 80px`,
              gap: 0,
              background: rowIdx % 2 === 0 ? '#132238' : '#0F1E33',
              border: '1px solid rgba(201,169,110,0.06)',
              borderTop: rowIdx === 0 ? '1px solid rgba(201,169,110,0.1)' : 'none',
              borderRadius: rowIdx === filteredAgents.length - 1 ? '0 0 6px 6px' : 0,
            }}
          >
            {/* Agent name cell */}
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.firstName} {a.lastName}
                </div>
                <div style={{ fontSize: 10, color: '#6B8299', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>{a.agentCode}</span>
                  <span style={{ fontSize: 9, color: '#C9A96E', fontWeight: 700, letterSpacing: '0.1em' }}>P{a.phase}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    color: isFullyLicensed ? '#4ADE80' : pct >= 50 ? '#F59E0B' : '#6B8299',
                  }}>
                    {pct}%
                  </span>
                </div>
              </div>
            </div>

            {/* Item cells */}
            {data.items.map(k => {
              const completed = !!data.completedMap[`${a.id}:${k}`]
              const isHovered = hover?.agentId === a.id && hover?.itemKey === k
              return (
                <div
                  key={k}
                  onMouseEnter={() => setHover({ agentId: a.id, itemKey: k })}
                  onMouseLeave={() => setHover(null)}
                  title={`${a.firstName} ${a.lastName}: ${ITEM_LABELS[k]} ${completed ? '(completed)' : '(pending)'}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderLeft: '1px solid rgba(255,255,255,0.04)',
                    background: isHovered ? 'rgba(201,169,110,0.08)' : 'transparent',
                    transition: 'background 0.1s',
                    cursor: 'default',
                  }}
                >
                  {completed ? (
                    <div style={{
                      width: 16, height: 16, borderRadius: 3,
                      background: 'rgba(201,169,110,0.2)',
                      border: '1px solid rgba(201,169,110,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#C9A96E', fontWeight: 700,
                    }}>
                      ✓
                    </div>
                  ) : (
                    <div style={{
                      width: 16, height: 16, borderRadius: 3,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }} />
                  )}
                </div>
              )
            })}

            {/* Carriers cell */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderLeft: '1px solid rgba(201,169,110,0.15)',
              fontSize: 11, color: a.carriers.appointed > 0 ? '#4ADE80' : '#6B8299',
              fontWeight: 600,
            }}
              title={a.carriers.carriers.map(c => `${c.carrier}: ${c.status}`).join(', ') || 'No carriers'}
            >
              {a.carriers.appointed > 0
                ? `${a.carriers.appointed}/${a.carriers.total}`
                : a.carriers.pending > 0
                  ? <span style={{ color: '#F59E0B' }}>{a.carriers.pending} pending</span>
                  : '0'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#132238', border: '1px solid rgba(201,169,110,0.1)',
      borderRadius: 6, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 300, color: accent ?? '#ffffff' }}>
        {value}
      </div>
    </div>
  )
}
