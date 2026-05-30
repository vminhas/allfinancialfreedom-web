'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Known categories with curated icons + labels. Anything else from
// the admin /vault/setup page that isn't in this map still renders,
// in its own section, with a default icon, so a new category added
// in vault auto-appears on the agent side without a code change.
const RESOURCE_GROUPS: { key: string; label: string; icon: string }[] = [
  { key: 'videos',    label: 'Videos',    icon: '▶' },
  { key: 'books',     label: 'Books',     icon: '◈' },
  { key: 'training',  label: 'Training',  icon: '◐' },
  { key: 'scripts',   label: 'Scripts',   icon: '✎' },
  { key: 'tools',     label: 'Tools',     icon: '⚙' },
  { key: 'forms',     label: 'Forms',     icon: '◫' },
  { key: 'general',   label: 'General',   icon: '↗' },
]

const DEFAULT_GROUP_META = { icon: '↗', labelFromKey: (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

// Phase color tokens, kept in sync with /src/lib/phase-colors.ts. Each
// locked resource borrows its required phase's color so the agent can
// see at a glance which rank unlocks it.
const PHASE_COLOR: Record<number, string> = {
  1: '#60a5fa', 2: '#4ade80', 3: '#C9A96E', 4: '#818cf8', 5: '#e879f9', 6: '#fbbf24',
}
const PHASE_NAME: Record<number, string> = {
  1: 'Onboarding', 2: 'Field Training', 3: 'CFT', 4: 'MD', 5: 'EMD', 6: 'NVP',
}

interface Resource {
  key: string
  label: string
  url: string
  category: string
  description: string | null
  unlocksAtPhase: number
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [agentPhase, setAgentPhase] = useState(1)
  const [loading, setLoading] = useState(true)
  // Click-on-locked nudge. Pulses below the page header for a few
  // seconds so the agent gets immediate feedback that the resource
  // is gated, with the phase they need to reach.
  const [nudge, setNudge] = useState<{ phase: number; label: string } | null>(null)

  useEffect(() => {
    fetch('/api/agents/setup-resources?full=1')
      .then(r => r.json())
      .then((d: { resources: Resource[]; agentPhase: number }) => {
        if (Array.isArray(d.resources)) {
          setResources(d.resources)
          setAgentPhase(d.agentPhase ?? 1)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const nudgeLockedClick = (r: Resource) => {
    setNudge({ phase: r.unlocksAtPhase, label: r.label })
    window.setTimeout(() => setNudge(null), 3200)
  }

  // Build groups in the curated order first, then append any unknown
  // categories the admin created in vault that aren't in
  // RESOURCE_GROUPS so they still surface (just without a hand-tuned
  // icon). Within each group, sort unlocked first, then locked
  // ascending by required phase so the closest-to-unlock comes next.
  const knownKeys = new Set(RESOURCE_GROUPS.map(g => g.key))
  const sortItems = (items: Resource[]) => {
    return [...items].sort((a, b) => {
      const aLocked = a.unlocksAtPhase > agentPhase
      const bLocked = b.unlocksAtPhase > agentPhase
      if (aLocked !== bLocked) return aLocked ? 1 : -1
      if (a.unlocksAtPhase !== b.unlocksAtPhase) return a.unlocksAtPhase - b.unlocksAtPhase
      return a.label.localeCompare(b.label)
    })
  }
  const grouped = [
    ...RESOURCE_GROUPS.map(g => ({ ...g, items: sortItems(resources.filter(r => r.category === g.key)) })),
    ...Array.from(new Set(resources.map(r => r.category)))
      .filter(c => c && !knownKeys.has(c))
      .map(c => ({
        key: c,
        label: DEFAULT_GROUP_META.labelFromKey(c),
        icon: DEFAULT_GROUP_META.icon,
        items: sortItems(resources.filter(r => r.category === c)),
      })),
  ].filter(g => g.items.length > 0)

  const totalCount = resources.length
  const unlockedCount = resources.filter(r => r.unlocksAtPhase <= agentPhase).length
  const lockedCount = totalCount - unlockedCount
  const progressPct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0
  const currentPhaseColor = PHASE_COLOR[agentPhase] ?? '#C9A96E'
  const preview = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('preview') : null
  const backHref = preview ? `/agents?preview=${encodeURIComponent(preview)}` : '/agents'

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
          <span style={{ marginLeft: 12, fontSize: 11, color: '#4B5563' }}>Resources</span>
        </div>
        <Link
          href={backHref}
          style={{ color: '#9BB0C4', fontSize: 12, textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}
        >
          ← Back to portal
        </Link>
      </div>

      <div style={{ padding: 'clamp(20px, 4vw, 36px) clamp(16px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 'clamp(22px, 4.5vw, 32px)', fontWeight: 300, margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em' }}>
            Resources
          </h1>
          <p style={{ fontSize: 13, color: '#6B8299', marginTop: 6 }}>
            Training videos, books, tools, and links curated by the leadership team. New resources unlock as you advance through the phases.
          </p>
        </div>

        {/* Progression strip. Shows current phase, total unlocked, and a
            phase-colored progress bar. Hides until resources load so
            the bar doesn't render at 0% for half a second. */}
        {!loading && totalCount > 0 && (
          <div style={{
            background: '#132238',
            border: `1px solid ${currentPhaseColor}40`,
            borderRadius: 8,
            padding: '14px 18px',
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: currentPhaseColor,
                  padding: '3px 9px', borderRadius: 999,
                  background: `${currentPhaseColor}1a`,
                  border: `1px solid ${currentPhaseColor}55`,
                }}>
                  Phase {agentPhase} · {PHASE_NAME[agentPhase] ?? '—'}
                </span>
                <span style={{ fontSize: 12, color: '#9BB0C4' }}>
                  <strong style={{ color: '#fff' }}>{unlockedCount}</strong> of <strong style={{ color: '#fff' }}>{totalCount}</strong> resources unlocked
                  {lockedCount > 0 && <span style={{ color: '#6B8299' }}> · {lockedCount} to go</span>}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#6B8299', letterSpacing: '0.06em' }}>
                {progressPct}% complete
              </div>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${progressPct}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${currentPhaseColor}, ${currentPhaseColor}cc)`,
                transition: 'width .6s ease',
              }} />
            </div>
          </div>
        )}

        {/* Inline nudge when someone clicks a locked card. Slides in
            under the progress strip, fades after ~3 seconds. */}
        {nudge && (
          <div style={{
            background: `${PHASE_COLOR[nudge.phase]}1a`,
            border: `1px solid ${PHASE_COLOR[nudge.phase]}80`,
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12,
            color: PHASE_COLOR[nudge.phase],
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <span>
              <strong>{nudge.label}</strong> unlocks at Phase {nudge.phase} · {PHASE_NAME[nudge.phase]}. Keep climbing.
            </span>
          </div>
        )}

        {/* Featured: NEPQ Playbook. Always shown at the top regardless
            of admin-managed setup. This is the methodology our call
            reviews grade against, so every agent should be able to
            find it immediately. */}
        <Link
          href="/agents/resources/coaching/nepq"
          style={{
            display: 'block', marginBottom: 20,
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(201,169,110,0.12) 0%, rgba(201,169,110,0.04) 100%)',
            border: '1px solid rgba(201,169,110,0.35)', borderRadius: 8,
            textDecoration: 'none', color: 'inherit',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute', right: -30, bottom: -30, width: 180, height: 180,
            background: 'radial-gradient(circle, rgba(201,169,110,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8, flexShrink: 0,
              background: 'rgba(201,169,110,0.2)', color: '#C9A96E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>◐</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
                Coaching Methodology
              </div>
              <div style={{ fontSize: 17, fontWeight: 500, color: '#ffffff', marginBottom: 4, lineHeight: 1.2 }}>
                The NEPQ Playbook
              </div>
              <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.55 }}>
                What our AI grades your calls on. The 5 stages, all named techniques, and every anti-pattern. Built from the source books.
              </div>
            </div>
            <span style={{ color: '#C9A96E', fontSize: 18, flexShrink: 0 }}>→</span>
          </div>
        </Link>

        {loading ? (
          <div style={{ color: '#6B8299', fontSize: 13 }}>Loading resources...</div>
        ) : grouped.length === 0 ? (
          <div style={{ color: '#4B5563', fontSize: 13 }}>No additional resources available yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {grouped.map(g => (
              <div key={g.key} style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 14, color: '#C9A96E' }}>{g.icon}</span>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
                    {g.label}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 8 }}>
                  {g.items.map(r => (
                    <ResourceCard
                      key={r.key}
                      resource={r}
                      groupKey={g.key}
                      agentPhase={agentPhase}
                      onLockedClick={nudgeLockedClick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Individual resource tile. Three visual states driven by
// `unlocksAtPhase` vs the agent's current phase:
//
//   1. Unlocked: full color, clickable, phase-color corner dot showing
//      which rank originally unlocked it (proud-of-progress moment).
//   2. Locked, next phase up ("almost there"): 30% desaturated, glowing
//      phase-color border, padlock icon, "Unlocks at Phase X" text.
//   3. Locked, further out: 60% desaturated, matte phase-color border,
//      same padlock + text.
//
// Locked tiles render as <button> with no-op click that fires a small
// nudge banner above the list.
function ResourceCard({
  resource,
  groupKey,
  agentPhase,
  onLockedClick,
}: {
  resource: Resource
  groupKey: string
  agentPhase: number
  onLockedClick: (r: Resource) => void
}) {
  const locked = resource.unlocksAtPhase > agentPhase
  const nextUp = locked && resource.unlocksAtPhase === agentPhase + 1
  const phaseColor = PHASE_COLOR[resource.unlocksAtPhase] ?? '#C9A96E'

  const iconBg = groupKey === 'videos' ? 'rgba(239,68,68,0.1)'
    : groupKey === 'books' ? 'rgba(201,169,110,0.1)'
    : 'rgba(96,165,250,0.1)'
  const iconColor = groupKey === 'videos' ? '#ef4444'
    : groupKey === 'books' ? '#C9A96E'
    : '#60a5fa'
  const iconGlyph = groupKey === 'videos' ? '▶'
    : groupKey === 'books' ? '◈'
    : '↗'

  if (locked) {
    return (
      <button
        type="button"
        onClick={() => onLockedClick(resource)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 6,
          background: 'rgba(255,255,255,0.015)',
          border: `1px solid ${phaseColor}${nextUp ? '99' : '55'}`,
          boxShadow: nextUp ? `0 0 0 1px ${phaseColor}22, 0 0 24px ${phaseColor}1a` : 'none',
          textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%',
          filter: nextUp ? 'grayscale(0.5) brightness(0.85)' : 'grayscale(0.85) brightness(0.65)',
          opacity: nextUp ? 0.85 : 0.7,
          transition: 'filter .2s ease, opacity .2s ease',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 6, flexShrink: 0,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: iconColor,
        }}>
          {iconGlyph}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, color: '#ffffff', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {resource.label}
          </div>
          <div style={{
            fontSize: 10, marginTop: 1,
            color: phaseColor,
            letterSpacing: '0.06em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: 600,
          }}>
            Unlocks at Phase {resource.unlocksAtPhase} · {PHASE_NAME[resource.unlocksAtPhase]}
          </div>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: 999, flexShrink: 0,
          background: `${phaseColor}22`,
          border: `1px solid ${phaseColor}80`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: phaseColor,
        }}>
          🔒
        </div>
      </button>
    )
  }

  // Unlocked: original full-color tile, plus a small phase-colored dot
  // showing which phase opened it up (subtle progression badge).
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 6,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        textDecoration: 'none', color: 'inherit',
        transition: 'all 0.15s',
        position: 'relative',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: iconColor,
      }}>
        {iconGlyph}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, color: '#ffffff', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {resource.label}
        </div>
        <div style={{
          fontSize: 10, color: '#4B5563', marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {resource.url.replace(/^https?:\/\//, '').split('/')[0]}
        </div>
      </div>
      {resource.unlocksAtPhase > 1 && (
        <div title={`Unlocked at Phase ${resource.unlocksAtPhase} · ${PHASE_NAME[resource.unlocksAtPhase]}`} style={{
          width: 8, height: 8, borderRadius: 999, flexShrink: 0,
          background: phaseColor,
          boxShadow: `0 0 8px ${phaseColor}80`,
        }} />
      )}
    </a>
  )
}
