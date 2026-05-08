'use client'

import type { CSSProperties } from 'react'

// Renders earned recognitions (CFT today; future EliteCFT, TopRecruiter,
// etc.) in two form factors:
//
//   pill - "loud and proud" gold capsule with 3-letter abbrev. Use on
//          trading cards, profile drawers, agent detail panes — places
//          with horizontal room and where the achievement should
//          pop visually.
//
//   star - compact gold five-pointed icon. Use in row-dense surfaces
//          (leaderboard rows, vault tracker, team tree) where a pill
//          would clutter, or where space is at a premium on mobile.
//
// Both use the same source of truth (AgentProfile.badges) and the same
// color palette so the visual identity is consistent across the
// portal. Tooltip on hover reveals the long-form name.

const BADGE_META: Record<string, { abbrev: string; longLabel: string; description: string; color: string; pillBg: string }> = {
  CFT: {
    abbrev: 'CFT',
    longLabel: 'Certified Field Trainer',
    description: 'Has signed off on all four Phase 3 CFT certification items.',
    color: '#C9A96E',
    pillBg: 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)',
  },
}

interface BadgesProps {
  badges: string[] | null | undefined
  variant: 'pill' | 'star'
  // Optional size scale. Default 'md'. 'sm' for tight spots, 'lg' for
  // hero placements (trading card header).
  size?: 'sm' | 'md' | 'lg'
  // Inline style merge for parent layout adjustments.
  style?: CSSProperties
}

export default function AgentBadges({ badges, variant, size = 'md', style }: BadgesProps) {
  if (!Array.isArray(badges) || badges.length === 0) return null

  // Filter to known badges only — silently drop any unknown keys so a
  // future server adds a 'TopRecruiter' value before the client knows
  // about it without crashing.
  const known = badges.filter(b => BADGE_META[b])
  if (known.length === 0) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: variant === 'star' ? 2 : 4, ...style }}>
      {known.map(key => {
        const meta = BADGE_META[key]
        return variant === 'pill'
          ? <Pill key={key} meta={meta} size={size} />
          : <Star key={key} meta={meta} size={size} />
      })}
    </span>
  )
}

function Pill({ meta, size }: { meta: typeof BADGE_META[string]; size: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm'
    ? { padX: 6, padY: 1, fontSize: 9, letter: '0.12em' }
    : size === 'lg'
      ? { padX: 12, padY: 4, fontSize: 12, letter: '0.16em' }
      : { padX: 9, padY: 2, fontSize: 10, letter: '0.14em' }

  return (
    <span
      title={`${meta.longLabel} · ${meta.description}`}
      aria-label={meta.longLabel}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: `${dims.padY}px ${dims.padX}px`,
        background: meta.pillBg,
        color: '#142D48',
        fontSize: dims.fontSize,
        fontWeight: 800,
        letterSpacing: dims.letter,
        textTransform: 'uppercase',
        borderRadius: 999,
        boxShadow: `0 1px 2px rgba(0,0,0,0.25), 0 0 0 1px ${meta.color}66 inset`,
        lineHeight: 1.2,
        verticalAlign: 'middle',
      }}
    >
      {meta.abbrev}
    </span>
  )
}

function Star({ meta, size }: { meta: typeof BADGE_META[string]; size: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 11 : size === 'lg' ? 16 : 13

  return (
    <span
      title={`${meta.longLabel} · ${meta.description}`}
      aria-label={meta.longLabel}
      style={{ display: 'inline-flex', verticalAlign: 'middle', lineHeight: 1 }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 16 16"
        fill={meta.color}
        stroke={meta.color}
        strokeWidth={0.5}
        strokeLinejoin="round"
        aria-hidden
      >
        {/* Five-pointed star, hand-tuned points so it feels balanced
            at small render sizes (the auto-generated SVGs from icon
            libraries are usually a touch too pointy at 12px). */}
        <path d="M8 1.6 L9.84 5.92 L14.4 6.32 L10.96 9.36 L11.92 13.84 L8 11.36 L4.08 13.84 L5.04 9.36 L1.6 6.32 L6.16 5.92 Z" />
      </svg>
    </span>
  )
}
