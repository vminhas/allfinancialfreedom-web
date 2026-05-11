'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useIsMobile } from '@/lib/useIsMobile'
import ProductionLeaderboard from './ProductionLeaderboard'
import { LeaderboardTabsBar, useTabFromHash } from './LeaderboardTabs'

// Agent-facing leaderboard. Same matrix-style visualization the admin
// uses at /vault/progress, but slimmed down for an agent audience:
// no CSV, no admin-only filter, no agent search (looking colleagues
// up reads as creepy in a peer setting), no "stuck" red flag. The
// caller's own row is highlighted with a gold border + YOU badge,
// and rank is displayed prominently so the page reads as a
// motivational standing rather than an analytical dashboard.

interface Agent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  avatarUrl: string | null
}

interface ItemDef {
  phase: number
  itemKey: string
  label: string
  groupKey: string | null
}

interface Payload {
  agents: Agent[]
  items: ItemDef[]
  completedAt: Record<string, string>
  viewerAgentId: string
}

const PHASE_COLORS: Record<number, string> = {
  1: '#60a5fa', 2: '#4ade80', 3: '#C9A96E', 4: '#a78bfa', 5: '#f472b6',
}
const PHASE_TITLES: Record<number, string> = {
  1: 'Onboarding', 2: 'Training', 3: 'Advancement', 4: 'Leadership', 5: 'Mastery',
}

// Top-level page is now a tabbed shell: Production (the new
// production-rankings view) is the default, and the original onboarding-
// progression matrix is preserved as the second tab. The Shell
// (header + back-to-portal + iOS safe-area handling) wraps both so we
// don't duplicate the chrome between views.
export default function LeaderboardPage() {
  // ProductionLeaderboard + ProgressionMatrixView both read
  // useSearchParams (to honor the admin ?preview=<token> path) which
  // Next requires to be inside a <Suspense> boundary at build time —
  // otherwise the page fails to prerender. The Shell wrapper sits
  // outside Suspense so the chrome still renders on the server.
  return (
    <Shell>
      <Suspense fallback={<div style={{ padding: 24, color: '#6B8299', fontSize: 12 }}>Loading…</div>}>
        <LeaderboardInner />
      </Suspense>
    </Shell>
  )
}

function LeaderboardInner() {
  const [tab, setTab] = useTabFromHash('progression')
  return (
    <>
      <LeaderboardTabsBar active={tab} setActive={setTab} />
      {tab === 'production' ? <ProductionLeaderboard /> : <ProgressionMatrixView />}
    </>
  )
}

function ProgressionMatrixView() {
  const isMobile = useIsMobile()
  const searchParams = useSearchParams()
  const previewToken = searchParams.get('preview')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<{ agentId: string; itemKey: string } | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<number | 'all'>('all')

  useEffect(() => {
    const url = previewToken
      ? `/api/agents/leaderboard?preview=${previewToken}`
      : '/api/agents/leaderboard'
    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<Payload>
      })
      .then(setData)
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [previewToken])

  const items = useMemo(() => {
    if (!data) return []
    return data.items.filter(it => phaseFilter === 'all' || it.phase === phaseFilter)
  }, [data, phaseFilter])

  // Per-agent stats within the active filter. Used to rank.
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

  // Always sort by progress (this is a leaderboard). Ties broken by
  // higher phase, then by alphabetical surname so the order is stable.
  const ranked = useMemo(() => {
    if (!data) return [] as { rank: number; agent: Agent }[]
    const arr = [...data.agents].sort((a, b) => {
      const ra = agentStats.get(a.id)?.ratio ?? 0
      const rb = agentStats.get(b.id)?.ratio ?? 0
      if (ra !== rb) return rb - ra
      if (a.phase !== b.phase) return b.phase - a.phase
      return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
    })
    return arr.map((agent, i) => ({ rank: i + 1, agent }))
  }, [data, agentStats])

  const itemsByPhase = useMemo(() => {
    const map: Record<number, ItemDef[]> = {}
    for (const it of items) {
      if (!map[it.phase]) map[it.phase] = []
      map[it.phase].push(it)
    }
    return map
  }, [items])

  // Stats specifically about the viewer for the headline card.
  const viewerStats = useMemo(() => {
    if (!data) return null
    const me = ranked.find(r => r.agent.id === data.viewerAgentId)
    if (!me) return null
    const s = agentStats.get(me.agent.id) ?? { done: 0, total: 0, ratio: 0 }
    return { rank: me.rank, of: ranked.length, done: s.done, total: s.total, ratio: s.ratio, agent: me.agent }
  }, [data, ranked, agentStats])

  if (loading) return <Centered>Loading leaderboard...</Centered>
  if (error) return <Centered tone="error">Couldn&apos;t load leaderboard: {error}</Centered>
  if (!data) return null

  return (
    <>
      {/* Header + viewer's own headline card */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>
          Progression Matrix
        </p>
        <h1 style={{ color: '#ffffff', fontSize: isMobile ? 22 : 28, fontWeight: 300, margin: 0 }}>
          Where you stand
        </h1>
        <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          Every active AFF agent ranked by checklist completion. Your row is highlighted in gold.
          Hover or tap any cell for details.
        </p>
      </div>

      {viewerStats && (
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 10, marginBottom: 14,
        }}>
          <SummaryCard label="Your rank" value={`#${viewerStats.rank}`} sub={`of ${viewerStats.of}`} accent="#C9A96E" />
          <SummaryCard label="Completed" value={`${viewerStats.done}`} sub={`of ${viewerStats.total} items`} />
          <SummaryCard label="Your %" value={`${Math.round(viewerStats.ratio * 100)}%`} accent={PHASE_COLORS[viewerStats.agent.phase]} />
          <SummaryCard label="Phase" value={`${viewerStats.agent.phase}`} sub={PHASE_TITLES[viewerStats.agent.phase] ?? ''} accent={PHASE_COLORS[viewerStats.agent.phase]} />
        </div>
      )}

      {/* Phase filter */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
        marginBottom: 16, padding: '10px 12px',
        background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
      }}>
        <FilterPill active={phaseFilter === 'all'} onClick={() => setPhaseFilter('all')}>All Phases</FilterPill>
        {[1, 2, 3, 4, 5].map(ph => (
          <FilterPill key={ph} active={phaseFilter === ph} onClick={() => setPhaseFilter(ph)} accent={PHASE_COLORS[ph]}>
            Phase {ph}
          </FilterPill>
        ))}
      </div>

      {isMobile
        ? <MobileList ranked={ranked} stats={agentStats} viewerId={data.viewerAgentId} />
        : (
          <Matrix
            ranked={ranked}
            itemsByPhase={itemsByPhase}
            completedAt={data.completedAt}
            stats={agentStats}
            viewerId={data.viewerAgentId}
            hover={hover}
            onHover={setHover}
          />
        )
      }
    </>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────

// Mobile top bar reuses the same paddingTop pattern flagged in CLAUDE.md
// so the iPhone status bar doesn't overlap "Back to portal."
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#fff' }}>
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: '14px clamp(16px, 4vw, 32px)',
        paddingTop: 'calc(14px + env(safe-area-inset-top))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10,
        background: '#0A1628',
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </span>
          <span style={{ marginLeft: 12, fontSize: 11, color: '#4B5563' }}>Leaderboard</span>
        </div>
        <Link
          href="/agents"
          style={{ color: '#9BB0C4', fontSize: 12, textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}
        >
          ← Back to portal
        </Link>
      </div>

      <div style={{ padding: 'clamp(20px, 4vw, 36px) clamp(16px, 4vw, 32px)', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Desktop matrix ────────────────────────────────────────────────────

function Matrix({
  ranked, itemsByPhase, completedAt, stats, viewerId, hover, onHover,
}: {
  ranked: { rank: number; agent: Agent }[]
  itemsByPhase: Record<number, ItemDef[]>
  completedAt: Record<string, string>
  stats: Map<string, { done: number; total: number; ratio: number }>
  viewerId: string
  hover: { agentId: string; itemKey: string } | null
  onHover: (h: { agentId: string; itemKey: string } | null) => void
}) {
  const phases = Object.keys(itemsByPhase).map(Number).sort((a, b) => a - b)
  const cellSize = 26
  const cellInsetPad = 4
  const labelColWidth = 240
  const phaseGap = 6
  const headerHeight = 210

  // Two-track scroll: the header band is its own overflow-x container
  // sticking to the page viewport, the body is the second overflow-x
  // container, and we mirror body.scrollLeft → header.scrollLeft so the
  // columns line up while the agent rows pan horizontally. This is the
  // AG-Grid pattern. The previous version put both header and body in
  // a single overflow:auto box with maxHeight, which made the matrix
  // feel cramped because only ~half the rows were visible at a time.
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const body = bodyScrollRef.current
    const header = headerScrollRef.current
    if (!body || !header) return
    const sync = () => { header.scrollLeft = body.scrollLeft }
    body.addEventListener('scroll', sync, { passive: true })
    return () => body.removeEventListener('scroll', sync)
  }, [])

  return (
    <div style={{
      background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
      // No overflow on this wrapper; the page handles vertical scroll
      // and the children handle their own horizontal scroll. That lets
      // the header band be `position: sticky` against the viewport
      // rather than the (previously cramped) inner box.
    }}>
      {/* Hide the header's horizontal scrollbar — we drive it
          programmatically from the body's scrollLeft, so no UI is
          needed for it. The body keeps its visible scrollbar. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .aff-matrix-header-track { scrollbar-width: none; -ms-overflow-style: none; }
        .aff-matrix-header-track::-webkit-scrollbar { display: none; }
      ` }} />

      {/* Sticky header band — column titles + phase color bars. Sticks
          to the viewport just below the page's top nav (Shell). The
          70px offset is the nav's measured height; if the nav grows,
          increase this. */}
      <div
        ref={headerScrollRef}
        className="aff-matrix-header-track"
        style={{
          position: 'sticky',
          top: 'calc(50px + env(safe-area-inset-top))',
          zIndex: 5,
          overflowX: 'auto',
          background: '#142D48',
          borderRadius: '6px 6px 0 0',
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(201,169,110,0.15)' }}>
            <div style={{ width: labelColWidth, flexShrink: 0, height: headerHeight, position: 'sticky', left: 0, background: '#142D48', zIndex: 4, borderRight: '1px solid rgba(201,169,110,0.15)' }} />
          {phases.map((ph, phIdx) => (
            <div key={ph} style={{ display: 'flex', marginLeft: phIdx === 0 ? 0 : phaseGap }}>
              {itemsByPhase[ph].map((it, idx) => {
                const isHovered = hover?.itemKey === it.itemKey
                return (
                  <div
                    key={it.itemKey}
                    style={{
                      width: cellSize, height: headerHeight, flexShrink: 0,
                      // Punchier first-of-phase rule (3px) so the phase
                      // boundaries are unambiguous; rest is a 1px hairline.
                      borderLeft: idx === 0 ? `3px solid ${PHASE_COLORS[ph]}` : '1px solid rgba(255,255,255,0.04)',
                      position: 'relative',
                      background: isHovered ? `${PHASE_COLORS[ph]}18` : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    title={`Phase ${ph} · ${it.label}`}
                  >
                    <div style={{
                      position: 'absolute', bottom: 8, left: '50%',
                      transform: 'translateX(-50%)',
                      writingMode: 'vertical-rl', textOrientation: 'mixed',
                      rotate: '180deg',
                      whiteSpace: 'nowrap', fontSize: 10, lineHeight: 1,
                      color: isHovered ? '#ffffff' : '#9BB0C4',
                      fontWeight: isHovered ? 600 : 400,
                      maxHeight: headerHeight - 20,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {it.label}
                    </div>
                    {/* Alignment tick anchoring the rotated label to its
                        column body. 1px wide, 6px tall, faint. Lights up
                        in the phase color on hover so eye-tracking is
                        unambiguous. PowerBI / Tableau pattern. */}
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

          {/* Phase color band — part of the sticky header band, no
              separate sticky needed (the parent track sticks). */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
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
        </div>
      </div>

      {/* Body — separate horizontal-scroll track. Agent rows pan
          horizontally here; on scroll we mirror scrollLeft into the
          header track so the columns stay aligned. */}
      <div
        ref={bodyScrollRef}
        style={{
          overflowX: 'auto',
          background: '#142D48',
          borderRadius: '0 0 6px 6px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
        {/* Ranked agent rows. The viewer's row gets a gold left border,
            tinted background, and a "YOU" pill so you can find yourself
            in a roster of any size at a glance. */}
        {ranked.map(({ rank, agent }) => {
          const s = stats.get(agent.id)
          const isHoveredRow = hover?.agentId === agent.id
          const isYou = agent.id === viewerId
          return (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                background: isYou ? 'rgba(201,169,110,0.08)' : isHoveredRow ? 'rgba(201,169,110,0.04)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div
                style={{
                  width: labelColWidth, flexShrink: 0,
                  position: 'sticky', left: 0, zIndex: 2,
                  background: isYou
                    ? 'rgba(31,55,87,1)'  // solid so the gold ring reads
                    : isHoveredRow ? '#1a3656' : '#142D48',
                  padding: '6px 10px',
                  borderRight: '1px solid rgba(201,169,110,0.15)',
                  borderLeft: isYou ? '3px solid #C9A96E' : 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                  height: cellSize + 4,
                }}
              >
                <span style={{
                  fontSize: 11, fontWeight: 700, color: rank <= 3 ? '#C9A96E' : '#6B8299',
                  width: 26, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                }}>
                  #{rank}
                </span>
                <Avatar firstName={agent.firstName} lastName={agent.lastName} avatarUrl={agent.avatarUrl} size={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#ffffff', fontWeight: isYou ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
                    {agent.firstName} {agent.lastName}
                    {isYou && (
                      <span style={{ marginLeft: 6, fontSize: 8, color: '#C9A96E', padding: '1px 6px', background: 'rgba(201,169,110,0.18)', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}>You</span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: '#6B8299', display: 'flex', gap: 6, marginTop: 1 }}>
                    <span style={{ color: PHASE_COLORS[agent.phase] }}>P{agent.phase}</span>
                  </div>
                </div>
                {s && s.total > 0 && (
                  <span style={{ fontSize: 9, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(s.ratio * 100)}%
                  </span>
                )}
              </div>

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
                          background: isHovered
                            ? `${PHASE_COLORS[it.phase]}30`
                            : isHoveredCol || isHoveredRow
                              ? `${PHASE_COLORS[it.phase]}10`
                              : 'transparent',
                          borderLeft: idx === 0 ? `2px solid ${PHASE_COLORS[ph]}` : '1px solid rgba(255,255,255,0.04)',
                          transition: 'background 0.1s',
                        }}
                        title={`${agent.firstName} ${agent.lastName} · ${it.label} · ${done ? 'Completed' : 'Not yet'}${done ? ` (${new Date(completedAt[`${agent.id}:${it.itemKey}`]).toLocaleDateString()})` : ''}`}
                      >
                        <div style={{
                          width: '100%', height: '100%',
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
    </div>
  )
}

// ─── Mobile ranked list ───────────────────────────────────────────────

function MobileList({
  ranked, stats, viewerId,
}: {
  ranked: { rank: number; agent: Agent }[]
  stats: Map<string, { done: number; total: number; ratio: number }>
  viewerId: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ranked.map(({ rank, agent }) => {
        const s = stats.get(agent.id) ?? { done: 0, total: 0, ratio: 0 }
        const isYou = agent.id === viewerId
        return (
          <div key={agent.id} style={{
            background: isYou ? 'rgba(201,169,110,0.08)' : '#142D48',
            borderRadius: 6,
            border: isYou ? '1px solid rgba(201,169,110,0.5)' : '1px solid rgba(201,169,110,0.1)',
            borderLeft: isYou ? '3px solid #C9A96E' : '1px solid rgba(201,169,110,0.1)',
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: rank <= 3 ? '#C9A96E' : '#6B8299',
              width: 32, textAlign: 'center', flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              #{rank}
            </span>
            <Avatar firstName={agent.firstName} lastName={agent.lastName} avatarUrl={agent.avatarUrl} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#ffffff', fontWeight: isYou ? 700 : 600 }}>{agent.firstName} {agent.lastName}</span>
                {isYou && (
                  <span style={{ fontSize: 8, color: '#C9A96E', padding: '1px 6px', background: 'rgba(201,169,110,0.18)', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}>You</span>
                )}
                <span style={{ fontSize: 9, color: PHASE_COLORS[agent.phase], fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>P{agent.phase}</span>
              </div>
              <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  width: `${Math.round(s.ratio * 100)}%`,
                  background: PHASE_COLORS[agent.phase],
                  borderRadius: 3,
                }} />
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#6B8299', fontVariantNumeric: 'tabular-nums' }}>
                {s.done} / {s.total} items &middot; {Math.round(s.ratio * 100)}%
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

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
      {sub && <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>{sub}</div>}
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
      <img src={avatarUrl} alt="" width={size} height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
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
