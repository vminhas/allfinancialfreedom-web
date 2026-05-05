'use client'

import { useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

// Adjacency-matrix style dashboard inspired by Bostock's Les Misérables
// matrix (https://bost.ocks.org/mike/miserables/). One row per agent, one
// column per checklist item across all phases, with a filled cell anywhere
// the agent has completed that item. Gives admin one screen of total
// visibility into who's progressing and where they're stuck.
//
// Mobile behavior: the matrix scrolls horizontally; the agent name column
// is sticky-left so the row is always identifiable. On very narrow screens
// we collapse to a compact list view (one agent per row, completion
// percentage + a phase progress bar) since 50+ tiny cells across a 375px
// viewport is unreadable.

interface Agent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  avatarUrl: string | null
  state: string | null
}

interface ItemDef {
  phase: number
  itemKey: string
  label: string
  groupKey: string | null
  adminOnly: boolean
}

interface Payload {
  agents: Agent[]
  items: ItemDef[]
  completedAt: Record<string, string>  // `${agentId}:${itemKey}` -> ISO date or ''
}

const PHASE_COLORS: Record<number, string> = {
  1: '#60a5fa',  // blue
  2: '#4ade80',  // green
  3: '#C9A96E',  // gold
  4: '#a78bfa',  // purple
  5: '#f472b6',  // pink
}
const PHASE_TITLES: Record<number, string> = {
  1: 'Onboarding',
  2: 'Training',
  3: 'Advancement',
  4: 'Leadership',
  5: 'Mastery',
}

export default function ProgressMatrixPage() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<{ agentId: string; itemKey: string } | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<number | 'all'>('all')
  const [agentSort, setAgentSort] = useState<'progress' | 'phase' | 'name'>('progress')
  const [hideAdminOnly, setHideAdminOnly] = useState(true)

  useEffect(() => {
    fetch('/api/admin/progress-matrix')
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<Payload>
      })
      .then(setData)
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // Items filtered by current phase + admin-only toggle. Stable reference
  // via useMemo so nothing recomputes on hover-state changes.
  const items = useMemo(() => {
    if (!data) return []
    return data.items.filter(it => {
      if (hideAdminOnly && it.adminOnly) return false
      if (phaseFilter !== 'all' && it.phase !== phaseFilter) return false
      return true
    })
  }, [data, phaseFilter, hideAdminOnly])

  // Per-agent stats: total possible (in current filter), total completed,
  // ratio. Used both to sort the row order and to render the percentage
  // pill / mobile compact view.
  const agentStats = useMemo(() => {
    if (!data) return new Map<string, { done: number; total: number; ratio: number }>()
    const itemKeys = new Set(items.map(i => i.itemKey))
    const m = new Map<string, { done: number; total: number; ratio: number }>()
    for (const a of data.agents) {
      let done = 0
      for (const k of itemKeys) {
        if (data.completedAt[`${a.id}:${k}`]) done++
      }
      const total = itemKeys.size
      m.set(a.id, { done, total, ratio: total > 0 ? done / total : 0 })
    }
    return m
  }, [data, items])

  const sortedAgents = useMemo(() => {
    if (!data) return []
    const arr = [...data.agents]
    arr.sort((a, b) => {
      if (agentSort === 'name') {
        return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
      }
      if (agentSort === 'phase') {
        if (a.phase !== b.phase) return b.phase - a.phase
        return (agentStats.get(b.id)?.ratio ?? 0) - (agentStats.get(a.id)?.ratio ?? 0)
      }
      // progress (default): most-completed first, ties broken by phase
      const ra = agentStats.get(a.id)?.ratio ?? 0
      const rb = agentStats.get(b.id)?.ratio ?? 0
      if (ra !== rb) return rb - ra
      return b.phase - a.phase
    })
    return arr
  }, [data, agentSort, agentStats])

  // Items grouped by phase for the column-header rendering. Each phase
  // gets a colored band above its column block.
  const itemsByPhase = useMemo(() => {
    const map: Record<number, ItemDef[]> = {}
    for (const it of items) {
      if (!map[it.phase]) map[it.phase] = []
      map[it.phase].push(it)
    }
    return map
  }, [items])

  if (loading) return <Centered>Loading progression matrix...</Centered>
  if (error) return <Centered tone="error">Couldn&apos;t load matrix: {error}</Centered>
  if (!data) return null

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>
          Progression Matrix
        </p>
        <h1 style={{ color: '#ffffff', fontSize: isMobile ? 22 : 28, fontWeight: 300, margin: 0 }}>
          Agents &middot; Checklist
        </h1>
        <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          Every active agent on the {isMobile ? 'left' : 'left'}, every checklist item across the top.
          Filled cells mean the agent has completed that item. Hover any cell for details.
        </p>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        marginBottom: 16, padding: '12px 14px',
        background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
      }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <FilterPill active={phaseFilter === 'all'} onClick={() => setPhaseFilter('all')}>All Phases</FilterPill>
          {[1, 2, 3, 4, 5].map(ph => (
            <FilterPill key={ph} active={phaseFilter === ph} onClick={() => setPhaseFilter(ph)} accent={PHASE_COLORS[ph]}>
              Phase {ph}
            </FilterPill>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select
          value={agentSort}
          onChange={e => setAgentSort(e.target.value as typeof agentSort)}
          style={{
            background: '#0A1628', color: '#9BB0C4',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, padding: '6px 10px', fontSize: 12,
          }}
        >
          <option value="progress">Sort: Most progress first</option>
          <option value="phase">Sort: Highest phase first</option>
          <option value="name">Sort: Name (A-Z)</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9BB0C4', fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideAdminOnly} onChange={e => setHideAdminOnly(e.target.checked)} />
          Hide admin-only items
        </label>
      </div>

      {/* Mobile compact list, desktop matrix. The breakpoint matches
          useIsMobile's 768px so the layout switches in lockstep with
          the rest of the vault shell. */}
      {isMobile
        ? <MobileList agents={sortedAgents} stats={agentStats} />
        : (
          <Matrix
            agents={sortedAgents}
            itemsByPhase={itemsByPhase}
            completedAt={data.completedAt}
            stats={agentStats}
            hover={hover}
            onHover={setHover}
          />
        )
      }
    </div>
  )
}

// ─── Desktop matrix ─────────────────────────────────────────────────────

function Matrix({
  agents, itemsByPhase, completedAt, stats, hover, onHover,
}: {
  agents: Agent[]
  itemsByPhase: Record<number, ItemDef[]>
  completedAt: Record<string, string>
  stats: Map<string, { done: number; total: number; ratio: number }>
  hover: { agentId: string; itemKey: string } | null
  onHover: (h: { agentId: string; itemKey: string } | null) => void
}) {
  const phases = Object.keys(itemsByPhase).map(Number).sort((a, b) => a - b)
  const allItems = phases.flatMap(p => itemsByPhase[p])
  const cellSize = 18
  const labelColWidth = 220

  // Column header height is the longest item label rotated 90°. Cap at
  // 220px so absurdly long item labels don't push the matrix off-screen.
  const headerHeight = 200

  return (
    <div style={{
      background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
      overflow: 'auto',
      // Containing the horizontal scroll inside this div keeps the page
      // header / sidebar from doing it; cleaner UX.
      maxWidth: '100%',
    }}>
      <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
        {/* Column headers */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: '#142D48', borderBottom: '1px solid rgba(201,169,110,0.15)' }}>
          <div style={{ width: labelColWidth, flexShrink: 0, height: headerHeight, position: 'sticky', left: 0, background: '#142D48', zIndex: 4, borderRight: '1px solid rgba(201,169,110,0.15)' }} />
          {phases.map(ph => (
            <div key={ph} style={{ display: 'flex' }}>
              {itemsByPhase[ph].map((it, idx) => {
                const isHovered = hover?.itemKey === it.itemKey
                return (
                  <div
                    key={it.itemKey}
                    style={{
                      width: cellSize, height: headerHeight, flexShrink: 0,
                      borderLeft: idx === 0 ? `2px solid ${PHASE_COLORS[ph]}` : '1px solid rgba(255,255,255,0.03)',
                      position: 'relative',
                      background: isHovered ? 'rgba(201,169,110,0.08)' : 'transparent',
                    }}
                    title={`Phase ${ph} · ${it.label}`}
                  >
                    <div style={{
                      position: 'absolute', bottom: 6, left: '50%',
                      transform: 'translateX(-50%) rotate(-65deg)',
                      transformOrigin: 'left bottom',
                      whiteSpace: 'nowrap', fontSize: 10,
                      color: isHovered ? '#ffffff' : '#9BB0C4',
                      fontWeight: isHovered ? 600 : 400,
                      maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {it.label}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Phase color bands above the columns. Floats between header and
            first row so the section breaks read clearly. */}
        <div style={{ display: 'flex', position: 'sticky', top: headerHeight, zIndex: 3, background: '#142D48' }}>
          <div style={{ width: labelColWidth, flexShrink: 0, position: 'sticky', left: 0, background: '#142D48', zIndex: 4 }} />
          {phases.map(ph => {
            const span = itemsByPhase[ph].length * cellSize
            return (
              <div key={ph} style={{
                width: span, height: 22, flexShrink: 0,
                background: PHASE_COLORS[ph],
                opacity: 0.18,
                borderLeft: `2px solid ${PHASE_COLORS[ph]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: PHASE_COLORS[ph] }}>
                  Phase {ph} &middot; {PHASE_TITLES[ph]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Agent rows */}
        {agents.map(agent => {
          const s = stats.get(agent.id)
          const isHoveredRow = hover?.agentId === agent.id
          return (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                background: isHoveredRow ? 'rgba(201,169,110,0.05)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {/* Agent label cell (sticky-left) */}
              <div
                style={{
                  width: labelColWidth, flexShrink: 0,
                  position: 'sticky', left: 0, zIndex: 2,
                  background: isHoveredRow ? '#1a3656' : '#142D48',
                  padding: '6px 10px',
                  borderRight: '1px solid rgba(201,169,110,0.15)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <Avatar firstName={agent.firstName} lastName={agent.lastName} avatarUrl={agent.avatarUrl} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#ffffff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.firstName} {agent.lastName}
                  </div>
                  <div style={{ fontSize: 9, color: '#6B8299', display: 'flex', gap: 6 }}>
                    <span>{agent.agentCode}</span>
                    <span style={{ color: PHASE_COLORS[agent.phase] }}>P{agent.phase}</span>
                  </div>
                </div>
                {s && s.total > 0 && (
                  <span style={{ fontSize: 9, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(s.ratio * 100)}%
                  </span>
                )}
              </div>

              {/* Cells */}
              {allItems.map(it => {
                const done = !!completedAt[`${agent.id}:${it.itemKey}`]
                const isHovered = hover?.agentId === agent.id && hover?.itemKey === it.itemKey
                const isHoveredCol = hover?.itemKey === it.itemKey
                return (
                  <div
                    key={it.itemKey}
                    onMouseEnter={() => onHover({ agentId: agent.id, itemKey: it.itemKey })}
                    onMouseLeave={() => onHover(null)}
                    style={{
                      width: cellSize, height: cellSize, flexShrink: 0,
                      background: done
                        ? PHASE_COLORS[it.phase]
                        : isHoveredCol || isHoveredRow
                          ? 'rgba(255,255,255,0.04)'
                          : 'transparent',
                      opacity: done ? (isHovered ? 1 : 0.85) : 1,
                      border: isHovered ? '1px solid #ffffff' : '1px solid rgba(255,255,255,0.03)',
                      cursor: 'default',
                      transition: 'opacity 0.1s, background 0.1s',
                    }}
                    title={`${agent.firstName} ${agent.lastName} · ${it.label} · ${done ? 'Completed' : 'Not yet'}${done ? ` (${new Date(completedAt[`${agent.id}:${it.itemKey}`]).toLocaleDateString()})` : ''}`}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mobile compact list ────────────────────────────────────────────────

function MobileList({
  agents, stats,
}: {
  agents: Agent[]
  stats: Map<string, { done: number; total: number; ratio: number }>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {agents.map(a => {
        const s = stats.get(a.id) ?? { done: 0, total: 0, ratio: 0 }
        return (
          <div key={a.id} style={{
            background: '#142D48', borderRadius: 6,
            border: '1px solid rgba(201,169,110,0.1)',
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Avatar firstName={a.firstName} lastName={a.lastName} avatarUrl={a.avatarUrl} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 600 }}>{a.firstName} {a.lastName}</span>
                <span style={{ fontSize: 9, color: PHASE_COLORS[a.phase], fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>P{a.phase}</span>
                <span style={{ fontSize: 10, color: '#6B8299' }}>{a.agentCode}</span>
              </div>
              <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  width: `${Math.round(s.ratio * 100)}%`,
                  background: PHASE_COLORS[a.phase],
                  borderRadius: 3,
                }} />
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#6B8299', fontVariantNumeric: 'tabular-nums' }}>
                {s.done} / {s.total} items completed &middot; {Math.round(s.ratio * 100)}%
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function FilterPill({ children, active, onClick, accent }: { children: React.ReactNode; active: boolean; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
        background: active ? `${accent ?? '#C9A96E'}22` : 'transparent',
        border: `1px solid ${active ? (accent ?? '#C9A96E') : 'rgba(255,255,255,0.06)'}`,
        color: active ? (accent ?? '#C9A96E') : '#6B8299',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Avatar({ firstName, lastName, avatarUrl, size }: { firstName: string; lastName: string; avatarUrl: string | null; size: number }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, color: '#C9A96E', fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{
      padding: 32, color: tone === 'error' ? '#f87171' : '#6B8299',
      fontSize: 13, textAlign: 'center',
    }}>{children}</div>
  )
}
