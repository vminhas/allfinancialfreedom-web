'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useIsMobile } from '@/lib/useIsMobile'
import { getAtRiskStatus, AT_RISK_THRESHOLDS } from '@/lib/agent-constants'
import PhaseItemDrawer, { type SelectedItem } from './PhaseItemDrawer'

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
  icaDate: string | null
  // ISO timestamp of when the agent entered their current phase.
  // Drives the time-aware "At Risk" badge: an agent in a fresh phase
  // with low completion is normal, not a problem; an agent who's been
  // in a phase past the expected duration with low completion is
  // worth surfacing for a check-in.
  phaseStartedAt: string | null
  lastLoginAt: string | null
  email: string | null
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
  // Column header click → opens the drawer with completed/pending lists
  // for that item, plus a "send reminder email" composer.
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<number | 'all'>('all')
  const [agentSort, setAgentSort] = useState<'progress' | 'phase' | 'name' | 'joined' | 'active'>('progress')
  const [hideAdminOnly, setHideAdminOnly] = useState(true)
  const [search, setSearch] = useState('')
  // "Stuck" = agent in their current phase with <50% of that phase's
  // items completed. Quick way to surface who needs a nudge from the
  // leadership team without combing the whole matrix.
  const [stuckOnly, setStuckOnly] = useState(false)

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

  // Per-agent state combining current-phase completion ratio AND
  // days-in-phase. Drives the "At Risk" badge + filter. Replaces the
  // old simplistic <50% rule which mislabeled anyone in a fresh phase
  // (low % is normal at the start, not a problem). Uses the shared
  // AT_RISK_THRESHOLDS so admin/agent surfaces stay consistent.
  const atRiskByAgent = useMemo(() => {
    if (!data) return new Map<string, { status: 'on-track' | 'behind' | 'at-risk'; ratio: number; daysInPhase: number | null }>()
    const m = new Map<string, { status: 'on-track' | 'behind' | 'at-risk'; ratio: number; daysInPhase: number | null }>()
    for (const a of data.agents) {
      const phaseItems = data.items.filter(it => it.phase === a.phase && (!hideAdminOnly || !it.adminOnly))
      const total = phaseItems.length
      const done = total > 0 ? phaseItems.filter(it => data.completedAt[`${a.id}:${it.itemKey}`]).length : 0
      const ratio = total > 0 ? done / total : 1
      const startedAt = a.phaseStartedAt ? new Date(a.phaseStartedAt) : null
      const status = getAtRiskStatus(a.phase, startedAt, done, total)
      const daysInPhase = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 86_400_000) : null
      m.set(a.id, { status, ratio, daysInPhase })
    }
    return m
  }, [data, hideAdminOnly])


  // Per-item completion rate across all currently-shown agents. Drives the
  // bar above each column so admins can spot bottleneck items at a glance.
  const itemCompletionRate = useMemo(() => {
    if (!data) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const it of items) {
      let done = 0
      for (const a of data.agents) {
        if (data.completedAt[`${a.id}:${it.itemKey}`]) done++
      }
      m.set(it.itemKey, data.agents.length > 0 ? done / data.agents.length : 0)
    }
    return m
  }, [data, items])

  const sortedAgents = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const arr = data.agents.filter(a => {
      if (q) {
        const hay = `${a.firstName} ${a.lastName} ${a.agentCode}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (stuckOnly) {
        // "Stuck" filter now means "at risk of not finishing on time"
        // — i.e. they've been in their phase past the expected
        // duration AND are below the minimum completion threshold for
        // that phase. Surfaces both `behind` and `at-risk` statuses
        // so admins see anyone who needs a check-in, not just the
        // worst cases.
        const info = atRiskByAgent.get(a.id)
        if (!info || info.status === 'on-track') return false
      }
      return true
    })
    arr.sort((a, b) => {
      if (agentSort === 'name') {
        return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
      }
      if (agentSort === 'phase') {
        if (a.phase !== b.phase) return b.phase - a.phase
        return (agentStats.get(b.id)?.ratio ?? 0) - (agentStats.get(a.id)?.ratio ?? 0)
      }
      if (agentSort === 'joined') {
        // Newest first. Nulls (no icaDate set) sort to the bottom so
        // the top of the list is always interpretable.
        const da = a.icaDate ? new Date(a.icaDate).getTime() : -Infinity
        const db_ = b.icaDate ? new Date(b.icaDate).getTime() : -Infinity
        return db_ - da
      }
      if (agentSort === 'active') {
        // Most recently active first. Agents who've never logged in
        // sort to the bottom (lastLoginAt null = -Infinity).
        const la = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : -Infinity
        const lb = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : -Infinity
        return lb - la
      }
      // progress (default): most-completed first, ties broken by phase
      const ra = agentStats.get(a.id)?.ratio ?? 0
      const rb = agentStats.get(b.id)?.ratio ?? 0
      if (ra !== rb) return rb - ra
      return b.phase - a.phase
    })
    return arr
  }, [data, agentSort, agentStats, search, stuckOnly, atRiskByAgent])

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

  // Aggregate stats for the summary cards above the matrix. Average
  // completion is a roster-wide ratio (sum of done / sum of possible)
  // rather than mean of per-agent ratios so big rosters don't get
  // dominated by one outlier.
  const aggregate = useMemo(() => {
    if (!data) return { agents: 0, items: 0, totalDone: 0, totalPossible: 0, avgPct: 0 }
    let totalDone = 0
    let totalPossible = 0
    for (const a of data.agents) {
      const s = agentStats.get(a.id)
      if (s) {
        totalDone += s.done
        totalPossible += s.total
      }
    }
    return {
      agents: data.agents.length,
      items: items.length,
      totalDone,
      totalPossible,
      avgPct: totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0,
    }
  }, [data, agentStats, items])

  // Mark an agent inactive directly from the matrix. Confirms first
  // (destructive-ish: removes them from rosters and reports), then
  // PATCHes /api/admin/agents/[id] with status=INACTIVE and removes
  // the row from local state so the UI reflects the change instantly.
  // The matrix endpoint already filters status:'ACTIVE', so a refetch
  // would also hide them; the optimistic local removal just avoids the
  // network round-trip.
  const markInactive = async (a: Agent) => {
    if (!data) return
    const ok = confirm(`Mark ${a.firstName} ${a.lastName} (${a.agentCode}) as inactive? They'll be hidden from the matrix and the agent leaderboard. You can reactivate them anytime from the AFF Tracker drawer.`)
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/agents/${a.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        alert(`Couldn't mark inactive: ${text.slice(0, 200) || res.status}`)
        return
      }
      setData(prev => prev ? { ...prev, agents: prev.agents.filter(x => x.id !== a.id) } : prev)
    } catch (err) {
      alert(`Network error marking inactive: ${err instanceof Error ? err.message : ''}`)
    }
  }

  // CSV export of the current matrix view (respects active filters and
  // sort order). Header is the item labels; each row is one agent with a
  // 1 / 0 per item. UTF-8 BOM up front so Excel opens it as Unicode.
  const exportCsv = () => {
    if (!data) return
    const cols = ['Agent', 'Code', 'Phase', 'Done', 'Total', '%']
    const itemList = Object.values(itemsByPhase).flat()
    for (const it of itemList) cols.push(it.label)
    const rows: string[] = [cols.map(escapeCsv).join(',')]
    for (const a of sortedAgents) {
      const s = agentStats.get(a.id) ?? { done: 0, total: 0, ratio: 0 }
      const r: string[] = [
        `${a.firstName} ${a.lastName}`,
        a.agentCode,
        String(a.phase),
        String(s.done),
        String(s.total),
        String(Math.round(s.ratio * 100)),
      ]
      for (const it of itemList) {
        r.push(data.completedAt[`${a.id}:${it.itemKey}`] ? '1' : '0')
      }
      rows.push(r.map(escapeCsv).join(','))
    }
    const blob = new Blob(['﻿', rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `aff-progression-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading) return <Centered>Loading progression matrix...</Centered>
  if (error) return <Centered tone="error">Couldn&apos;t load matrix: {error}</Centered>
  if (!data) return null

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>
          Progression Matrix
        </p>
        <h1 style={{ color: '#ffffff', fontSize: isMobile ? 22 : 28, fontWeight: 300, margin: 0 }}>
          Agents &middot; Checklist
        </h1>
        <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          Every active agent on the left, every checklist item across the top.
          Filled cells mean the agent has completed that item. Hover any cell for details.
        </p>
      </div>

      <ColumnHeaderHint />

      {/* Summary cards: roster-wide totals at a glance. Sit above the
          controls so they read first. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 10, marginBottom: 14,
      }}>
        <SummaryCard label="Active agents" value={aggregate.agents.toString()} />
        <SummaryCard label="Items shown" value={aggregate.items.toString()} />
        <SummaryCard label="Completions" value={aggregate.totalDone.toLocaleString()} sub={`${aggregate.totalPossible.toLocaleString()} possible`} />
        <SummaryCard label="Avg completion" value={`${aggregate.avgPct}%`} accent="#C9A96E" />
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        marginBottom: 16, padding: '12px 14px',
        background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
      }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <FilterPill active={phaseFilter === 'all'} onClick={() => setPhaseFilter('all')}>All Phases</FilterPill>
          {[1, 2, 3, 4, 5, 6].map(ph => (
            <FilterPill key={ph} active={phaseFilter === ph} onClick={() => setPhaseFilter(ph)} accent={PHASE_COLORS[ph]}>
              Phase {ph}
            </FilterPill>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search agent name or code..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: '#0A1628', color: '#ffffff',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, padding: '6px 10px', fontSize: 12,
            width: isMobile ? '100%' : 200,
          }}
        />
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
          <option value="joined">Sort: Newest joined</option>
          <option value="active">Sort: Most recently active</option>
          <option value="name">Sort: Name (A-Z)</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9BB0C4', fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideAdminOnly} onChange={e => setHideAdminOnly(e.target.checked)} />
          Hide admin-only items
        </label>
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: stuckOnly ? '#f87171' : '#9BB0C4',
            fontSize: 11, cursor: 'pointer',
            padding: '3px 8px', borderRadius: 4,
            background: stuckOnly ? 'rgba(248,113,113,0.08)' : 'transparent',
            border: `1px solid ${stuckOnly ? 'rgba(248,113,113,0.3)' : 'transparent'}`,
          }}
          title="At Risk = the agent has been in their phase longer than expected AND is below the minimum completion threshold for that phase. Time-aware, so a fresh-phase agent isn't flagged just because they're starting out."
        >
          <input type="checkbox" checked={stuckOnly} onChange={e => setStuckOnly(e.target.checked)} />
          At Risk only
          <span
            aria-hidden="true"
            title="At Risk = days-in-phase past expected AND completion below the phase threshold. Hover any AT RISK badge in the matrix for that agent's specific days + %."
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              color: '#6B8299', fontSize: 9, fontWeight: 700,
              cursor: 'help',
            }}
          >
            ?
          </span>
        </label>
        <button
          onClick={exportCsv}
          style={{
            background: 'transparent', color: '#C9A96E',
            border: '1px solid rgba(201,169,110,0.3)',
            borderRadius: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
          title="Download the current view as a CSV"
        >
          ↓ CSV
        </button>
      </div>

      {/* Empty state when filters knock everything out, so an admin
          searching for a name that doesn't match doesn't stare at a
          blank matrix wondering if it's broken. */}
      {sortedAgents.length === 0 && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: '#6B8299', fontSize: 13,
          background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
        }}>
          No agents match the current filters.{' '}
          <button
            onClick={() => { setSearch(''); setStuckOnly(false); setPhaseFilter('all') }}
            style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Mobile compact list, desktop matrix. The breakpoint matches
          useIsMobile's 768px so the layout switches in lockstep with
          the rest of the vault shell. */}
      {sortedAgents.length > 0 && (isMobile
        ? <MobileList agents={sortedAgents} stats={agentStats} onMarkInactive={markInactive} />
        : (
          <Matrix
            agents={sortedAgents}
            itemsByPhase={itemsByPhase}
            completedAt={data.completedAt}
            stats={agentStats}
            itemCompletionRate={itemCompletionRate}
            atRiskByAgent={atRiskByAgent}
            hover={hover}
            onHover={setHover}
            onMarkInactive={markInactive}
            onSelectItem={setSelectedItem}
          />
        )
      )}

      {/* Drawer that opens when a column header is clicked. Reuses the
          page's already-loaded data so we don't refetch the matrix. */}
      {selectedItem && data && (
        <PhaseItemDrawer
          selectedItem={selectedItem}
          agents={data.agents.map(a => ({
            id: a.id, agentCode: a.agentCode,
            firstName: a.firstName, lastName: a.lastName,
            phase: a.phase, email: a.email, lastLoginAt: a.lastLoginAt,
          }))}
          completedAt={data.completedAt}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}

function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

// ─── Desktop matrix ─────────────────────────────────────────────────────

function Matrix({
  agents, itemsByPhase, completedAt, stats, itemCompletionRate, atRiskByAgent, hover, onHover, onMarkInactive, onSelectItem,
}: {
  agents: Agent[]
  itemsByPhase: Record<number, ItemDef[]>
  completedAt: Record<string, string>
  stats: Map<string, { done: number; total: number; ratio: number }>
  itemCompletionRate: Map<string, number>
  atRiskByAgent: Map<string, { status: 'on-track' | 'behind' | 'at-risk'; ratio: number; daysInPhase: number | null }>
  hover: { agentId: string; itemKey: string } | null
  onHover: (h: { agentId: string; itemKey: string } | null) => void
  onMarkInactive: (a: Agent) => void
  onSelectItem: (s: SelectedItem) => void
}) {
  const phases = Object.keys(itemsByPhase).map(Number).sort((a, b) => a - b)
  // Bigger cell with internal padding so completed cells render as
  // discrete dots instead of merging into a continuous bar (the previous
  // 18px no-padding version made each row look like one stripe). The
  // 4px gap on each side leaves a clear gridline between cells.
  const cellSize = 26
  const cellInsetPad = 4
  const labelColWidth = 220
  const phaseGap = 6  // extra horizontal gap separating phase blocks

  // Column header height tuned for the rotated-vertical label. Most item
  // labels are ~22 chars so 9px font * 22 ≈ 200px gives plenty of room.
  const headerHeight = 210

  return (
    <div style={{
      background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
      // Single scroll container for both axes. The matrix is its own
      // viewport — sticky headers stick to the top of THIS box as the
      // user scrolls inside it. We tried `overflow-y: clip` to escape
      // sticky upward to the document, but Safari and some Chrome
      // versions don't honor it when paired with `overflow-x: auto`,
      // so headers stopped sticking entirely. Excel-style internal
      // scroll is universally supported.
      //
      // maxHeight is calc'd from viewport so the matrix fills the
      // remaining screen real estate after the page header / summary
      // cards / controls. As the user scrolls the page down, the
      // matrix's top edge eventually reaches the viewport top, and
      // from there the sticky headers visually pin to the top of the
      // screen — same UX the admin asked for, more reliable
      // implementation.
      overflow: 'auto',
      maxWidth: '100%',
      maxHeight: 'calc(100vh - 200px)',
      WebkitOverflowScrolling: 'touch',
    }}>
      <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
        {/* Column headers. Labels are rendered vertically (writing-mode +
            rotate) instead of obliquely so adjacent labels never overlap
            no matter how dense the cells get. */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: '#142D48', borderBottom: '1px solid rgba(201,169,110,0.15)' }}>
          <div style={{ width: labelColWidth, flexShrink: 0, height: headerHeight, position: 'sticky', left: 0, background: '#142D48', zIndex: 4, borderRight: '1px solid rgba(201,169,110,0.15)' }} />
          {phases.map((ph, phIdx) => (
            <div key={ph} style={{ display: 'flex', marginLeft: phIdx === 0 ? 0 : phaseGap }}>
              {itemsByPhase[ph].map((it, idx) => {
                const isHovered = hover?.itemKey === it.itemKey
                return (
                  <div
                    key={it.itemKey}
                    onClick={() => onSelectItem({ phase: ph, itemKey: it.itemKey, label: it.label })}
                    style={{
                      width: cellSize, height: headerHeight, flexShrink: 0,
                      // First-of-phase border bumped to a punchier 3px so phase
                      // boundaries are unambiguous; everything else gets a
                      // 1px hairline for column structure.
                      borderLeft: idx === 0 ? `3px solid ${PHASE_COLORS[ph]}` : '1px solid rgba(255,255,255,0.04)',
                      position: 'relative',
                      background: isHovered ? `${PHASE_COLORS[ph]}18` : 'transparent',
                      transition: 'background 0.1s',
                      cursor: 'pointer',
                    }}
                    title={`Click to see who's completed "${it.label}" — and send a reminder to who hasn't`}
                  >
                    {/* Click affordance: tiny chevron on hover so the
                        admin knows the rotated label is interactive
                        before they have to mouse over for the
                        tooltip. Lights up gold on hover, neutral
                        otherwise. Position is "above" the rotated
                        label since the label reads bottom-to-top. */}
                    <div style={{
                      position: 'absolute',
                      top: 6, left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: 10,
                      color: isHovered ? '#C9A96E' : 'rgba(155,176,196,0.35)',
                      transition: 'color 0.1s',
                      pointerEvents: 'none',
                      lineHeight: 1,
                    }}>›</div>
                    <div style={{
                      position: 'absolute',
                      bottom: 8, left: '50%',
                      transform: 'translateX(-50%)',
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      // Flip so the text reads bottom-to-top (more natural
                      // for English column labels than top-to-bottom).
                      rotate: '180deg',
                      whiteSpace: 'nowrap',
                      fontSize: 10, lineHeight: 1,
                      color: isHovered ? '#ffffff' : '#9BB0C4',
                      fontWeight: isHovered ? 600 : 400,
                      maxHeight: headerHeight - 30,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {it.label}
                    </div>
                    {/* Alignment tick — 1px vertical line at the column
                        center, bottom 0 → up 6px. Small but enough to
                        anchor the eye between the rotated label and the
                        cells below. PowerBI / Tableau use this same
                        pattern for narrow rotated-header columns. */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0, left: '50%',
                      width: 1, height: 6,
                      transform: 'translateX(-0.5px)',
                      background: isHovered ? PHASE_COLORS[ph] : 'rgba(255,255,255,0.10)',
                      transition: 'background 0.1s',
                    }} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Phase color bands above the columns. Sit between the headers
            and the first row, lined up with each phase block so the
            section breaks are visually unmistakable. */}
        <div style={{ display: 'flex', position: 'sticky', top: headerHeight, zIndex: 3, background: '#142D48', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: labelColWidth, flexShrink: 0, position: 'sticky', left: 0, background: '#142D48', zIndex: 4 }} />
          {phases.map((ph, phIdx) => {
            const span = itemsByPhase[ph].length * cellSize
            return (
              <div key={ph} style={{
                width: span, height: 24, flexShrink: 0,
                background: `${PHASE_COLORS[ph]}24`,
                borderLeft: `2px solid ${PHASE_COLORS[ph]}`,
                marginLeft: phIdx === 0 ? 0 : phaseGap,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: PHASE_COLORS[ph] }}>
                  Phase {ph} &middot; {PHASE_TITLES[ph]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Per-column completion bar — what fraction of the visible
            roster has done each item. Reads as a horizontal heatmap
            row: fully-filled column = everyone's done it, sparse =
            bottleneck training. Fastest signal in the whole page for
            "what's the team stuck on."

            Visual treatment is intentionally distinct from the data
            rows below: gold accent (not a phase color) + tinted row
            background + thin centered bar instead of a chip-shape, so
            the eye reads it as a summary band rather than another
            agent's data. */}
        {/* Roster Completion banner. Backgrounds are SOLID (not the
            translucent gold tint that read nicely at rest but let
            agent rows show through when they scrolled past underneath
            this sticky row). #1F344A is #142D48 with a 6% gold
            mix-down — same visual register, full opacity. */}
        <div style={{
          display: 'flex', position: 'sticky', top: headerHeight + 24, zIndex: 3,
          background: '#1F344A',
          borderTop: '1px solid rgba(201,169,110,0.25)',
          borderBottom: '1px solid rgba(201,169,110,0.25)',
        }}>
          <div style={{
            width: labelColWidth, flexShrink: 0, height: 32,
            position: 'sticky', left: 0,
            background: '#1F344A',
            zIndex: 4,
            borderRight: '1px solid rgba(201,169,110,0.15)',
            display: 'flex', alignItems: 'center', padding: '0 10px',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#C9A96E',
          }}>
            Roster Completion
          </div>
          {phases.map((ph, phIdx) => (
            <div key={ph} style={{ display: 'flex', marginLeft: phIdx === 0 ? 0 : phaseGap }}>
              {itemsByPhase[ph].map((it, idx) => {
                const rate = itemCompletionRate.get(it.itemKey) ?? 0
                const isHoveredCol = hover?.itemKey === it.itemKey
                return (
                  <div
                    key={it.itemKey}
                    title={`${Math.round(rate * 100)}% of roster has completed "${it.label}"`}
                    style={{
                      width: cellSize, height: 32, flexShrink: 0,
                      padding: '6px 0',
                      borderLeft: idx === 0 ? `2px solid ${PHASE_COLORS[ph]}` : '1px solid rgba(255,255,255,0.04)',
                      background: isHoveredCol ? 'rgba(201,169,110,0.12)' : 'transparent',
                      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    }}
                  >
                    {/* Thin centered bar — clearly distinct from the
                        rounded chips in the data rows. Gold at varying
                        opacity tracks completion rate. */}
                    <div style={{
                      width: 5,
                      height: `${Math.max(2, rate * 100)}%`,
                      background: '#C9A96E',
                      opacity: 0.35 + rate * 0.65,
                      borderRadius: 2,
                    }} />
                  </div>
                )
              })}
            </div>
          ))}
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
              {/* Sticky-left agent label. The Link inside opens the
                  tracker. A small hover-only ✕ sits at the right edge
                  to mark the agent inactive without leaving the page;
                  it's a sibling of the Link (not nested) so clicks
                  don't bubble into navigation. */}
              <div
                style={{
                  width: labelColWidth, flexShrink: 0,
                  position: 'sticky', left: 0, zIndex: 2,
                  background: isHoveredRow ? '#1a3656' : '#142D48',
                  borderRight: '1px solid rgba(201,169,110,0.15)',
                  height: cellSize + 4,
                }}
              >
                <Link
                  href={`/vault/tracker?agentId=${encodeURIComponent(agent.id)}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 28px 6px 10px',  // right padding leaves room for the ✕
                    height: '100%', boxSizing: 'border-box',
                    textDecoration: 'none', cursor: 'pointer',
                  }}
                  title={`Open ${agent.firstName} ${agent.lastName} in the AFF Tracker`}
                >
                  <Avatar firstName={agent.firstName} lastName={agent.lastName} avatarUrl={agent.avatarUrl} size={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#ffffff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
                      {agent.firstName} {agent.lastName}
                    </div>
                    <div style={{ fontSize: 9, color: '#6B8299', display: 'flex', gap: 6, marginTop: 1, alignItems: 'center' }}>
                      <span>{agent.agentCode}</span>
                      <span style={{ color: PHASE_COLORS[agent.phase] }}>P{agent.phase}</span>
                      {(() => {
                        const info = atRiskByAgent.get(agent.id)
                        if (!info || info.status === 'on-track') return null
                        const threshold = AT_RISK_THRESHOLDS[agent.phase]
                        const expectedDays = threshold?.days ?? 30
                        const minPct = threshold ? Math.round(threshold.minPct * 100) : 50
                        const isAtRisk = info.status === 'at-risk'
                        const tip = isAtRisk
                          ? `AT RISK: ${info.daysInPhase ?? '?'} days in Phase ${agent.phase} (expected ${expectedDays}) and only ${Math.round(info.ratio * 100)}% complete (target ${minPct}%). Worth a check-in.`
                          : `BEHIND: ${info.daysInPhase ?? '?'} days in Phase ${agent.phase} (expected ${expectedDays}) and ${Math.round(info.ratio * 100)}% complete (target ${minPct}%). Trending late but not critical yet.`
                        return (
                          <span
                            title={tip}
                            style={{
                              color: isAtRisk ? '#f87171' : '#F59E0B',
                              fontWeight: 700, cursor: 'help',
                              fontSize: 9, letterSpacing: '0.06em',
                            }}
                          >
                            {isAtRisk ? 'AT RISK' : 'BEHIND'}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                  {s && s.total > 0 && (
                    <span style={{ fontSize: 9, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(s.ratio * 100)}%
                    </span>
                  )}
                </Link>
                {/* Mark-inactive button. Hidden until the row is
                    hovered so it doesn't add visual noise to the
                    happy path. Confirms before firing. */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onMarkInactive(agent)
                  }}
                  title={`Mark ${agent.firstName} ${agent.lastName} inactive`}
                  aria-label="Mark inactive"
                  style={{
                    position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)',
                    width: 20, height: 20, padding: 0,
                    background: 'transparent',
                    border: '1px solid rgba(248,113,113,0.3)',
                    borderRadius: 4,
                    color: '#f87171', fontSize: 11, lineHeight: 1, cursor: 'pointer',
                    opacity: isHoveredRow ? 1 : 0,
                    transition: 'opacity 0.15s',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Cells, grouped by phase so we can put a visible gap between
                  phase blocks (mirrors the column-header phase gap above).
                  Each cell is a fixed-size container with an inner inset
                  square that's filled iff the agent has completed that
                  item — that way completed cells read as discrete dots
                  rather than merging into one continuous bar (which is
                  what the previous tight-pack layout looked like). */}
              {phases.map((ph, phIdx) => (
                <div key={ph} style={{ display: 'flex', marginLeft: phIdx === 0 ? 0 : phaseGap }}>
                  {itemsByPhase[ph].map((it, idx) => {
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
                          padding: cellInsetPad,
                          // Container background highlights the cross
                          // pattern (row + column) on hover; the dot itself
                          // stays its phase color.
                          background: isHovered
                            ? `${PHASE_COLORS[it.phase]}30`
                            : isHoveredCol || isHoveredRow
                              ? `${PHASE_COLORS[it.phase]}10`
                              : 'transparent',
                          borderLeft: idx === 0 ? `2px solid ${PHASE_COLORS[ph]}` : '1px solid rgba(255,255,255,0.04)',
                          transition: 'background 0.1s',
                          cursor: 'default',
                        }}
                        title={`${agent.firstName} ${agent.lastName} · ${it.label} · ${done ? 'Completed' : 'Not yet'}${done ? ` (${new Date(completedAt[`${agent.id}:${it.itemKey}`]).toLocaleDateString()})` : ''}`}
                      >
                        <div style={{
                          width: '100%', height: '100%',
                          // Done cells: solid phase fill. Not-done cells:
                          // a faint outlined chip in the same phase color
                          // so the grid stays visible across columns
                          // nobody has touched yet (otherwise the right
                          // half of the matrix reads as empty space and
                          // it's hard to track rows). Hover bumps the
                          // outline alpha so the cross-pattern still
                          // reads.
                          background: done ? PHASE_COLORS[it.phase] : 'transparent',
                          borderRadius: 3,
                          opacity: done ? (isHovered ? 1 : 0.9) : 1,
                          border: done
                            ? 'none'
                            : `1px solid ${PHASE_COLORS[it.phase]}${isHoveredCol || isHoveredRow ? '55' : '20'}`,
                          boxShadow: isHovered && done ? `0 0 0 1px #ffffff` : 'none',
                          transition: 'opacity 0.1s, box-shadow 0.1s, border-color 0.1s',
                        }} />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mobile compact list ────────────────────────────────────────────────

function MobileList({
  agents, stats, onMarkInactive,
}: {
  agents: Agent[]
  stats: Map<string, { done: number; total: number; ratio: number }>
  onMarkInactive: (a: Agent) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {agents.map(a => {
        const s = stats.get(a.id) ?? { done: 0, total: 0, ratio: 0 }
        return (
          <div
            key={a.id}
            style={{
              background: '#142D48', borderRadius: 6,
              border: '1px solid rgba(201,169,110,0.1)',
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              position: 'relative',
            }}
          >
            <Link
              href={`/vault/tracker?agentId=${encodeURIComponent(a.id)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                flex: 1, minWidth: 0,
                textDecoration: 'none', color: 'inherit',
                paddingRight: 28,
              }}
            >
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
            </Link>
            {/* Mark-inactive button. Always visible on mobile (no
                hover affordance) but small + muted. */}
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkInactive(a) }}
              title="Mark inactive"
              aria-label="Mark inactive"
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 24, height: 24, padding: 0,
                background: 'transparent',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 4,
                color: '#f87171', fontSize: 12, lineHeight: 1, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: '#142D48', borderRadius: 6, padding: '12px 14px',
      border: '1px solid rgba(201,169,110,0.1)',
    }}>
      <div style={{ fontSize: 9, color: '#6B8299', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, color: accent ?? '#ffffff', fontWeight: 300, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  )
}

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

// Discoverability hint: tells the admin the column headers are
// clickable and what happens when they click. Dismisses to
// localStorage so it disappears once and stays gone. The chevron
// glyph on hover is the always-on affordance; this banner is the
// first-time orientation.
function ColumnHeaderHint() {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem('aff-progress-column-hint-dismissed') : '1'
    setDismissed(v === '1')
  }, [])
  if (dismissed) return null
  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem('aff-progress-column-hint-dismissed', '1') } catch {}
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, marginBottom: 14, padding: '10px 14px',
      background: 'linear-gradient(90deg, rgba(201,169,110,0.10) 0%, rgba(201,169,110,0.04) 100%)',
      border: '1px solid rgba(201,169,110,0.25)', borderRadius: 6,
      fontSize: 12, color: '#E0C485',
    }}>
      <span>
        <strong>New:</strong> click any column header to see who&apos;s completed an item, and email a reminder to who hasn&apos;t.
      </span>
      <button
        onClick={dismiss}
        title="Got it"
        style={{
          background: 'transparent', border: '1px solid rgba(201,169,110,0.4)',
          color: '#C9A96E', padding: '3px 10px', borderRadius: 3,
          fontSize: 10, fontWeight: 700, cursor: 'pointer',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >Got it</button>
    </div>
  )
}
