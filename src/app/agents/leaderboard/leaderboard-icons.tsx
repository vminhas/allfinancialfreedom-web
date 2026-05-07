// Hand-tuned SVG icon set for the production leaderboard. Inlined
// (not lucide-react) so the visual weight, stroke, and gradient match
// AFF's premium dark-themed look exactly. Every icon is `currentColor`
// for stroke / fill so the parent controls hue, with select pieces
// (crown gem, medal ribbon) painted by gradient ID for the podium.

import type { CSSProperties, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number; style?: CSSProperties }

function base(p: IconProps) {
  const { size = 16, style, ...rest } = p
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style, ...rest }
}

// ─── Header / brand ───────────────────────────────────────────────────

export function TrophyIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      {/* Cup body with the classic two side-handles. The handles arc
          out of the cup and curl back to the rim, which is the
          silhouette people read as "trophy" instantly. */}
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5a2 2 0 0 0 0 4h3" />
      <path d="M16 6h3a2 2 0 0 1 0 4h-3" />
      <path d="M10 13h4l-1 5h-2l-1-5z" />
      <path d="M9 21h6" />
    </svg>
  )
}

export function CrownIcon(p: IconProps & { gemColor?: string }) {
  const { gemColor = '#FFD700', ...rest } = p
  return (
    <svg {...base(rest)} stroke="currentColor">
      <path d="M3 17l1.5-9 4 4 3.5-6 3.5 6 4-4L21 17z" />
      <path d="M3 17h18v3H3z" />
      {/* center gem highlight — what makes a crown read as #1 instead
          of just a generic shape. */}
      <circle cx="12" cy="14" r="1.3" fill={gemColor} stroke="none" />
    </svg>
  )
}

export function MedalIcon(p: IconProps & { ribbonColor?: string }) {
  const { ribbonColor = 'currentColor', size = 16, style, ...rest } = p
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={style} {...rest}>
      {/* ribbon — the V the medal hangs from */}
      <path d="M7 3l5 8 5-8" stroke={ribbonColor} />
      <path d="M9 3h6" stroke={ribbonColor} />
      {/* medal disc */}
      <circle cx="12" cy="16" r="5" stroke="currentColor" />
      <circle cx="12" cy="16" r="2.4" stroke="currentColor" />
    </svg>
  )
}

// ─── Metric icons ─────────────────────────────────────────────────────

export function SubmissionIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      {/* Clipboard with a check — "submitted application" mental model */}
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M8.5 12l2.5 2.5L16 9.5" />
    </svg>
  )
}

export function RecruitsIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      {/* Trio of figures — front person + two flanking. Reads as
          "people you brought in" better than a single user icon. */}
      <circle cx="12" cy="8" r="3" />
      <path d="M6 21v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" />
      <circle cx="5" cy="9" r="2.2" />
      <path d="M2 17v-1a3 3 0 0 1 3-3" />
      <circle cx="19" cy="9" r="2.2" />
      <path d="M22 17v-1a3 3 0 0 1-3-3" />
    </svg>
  )
}

export function PointsIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      {/* Four-pointed sparkle — softer, more "premium" than a star.
          Used by Apple, Linear, etc. for "points / achievement" UI. */}
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z" />
      <path d="M19 4.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L16.5 7l1.8-.7L19 4.5z" />
    </svg>
  )
}

// ─── Scope icons ──────────────────────────────────────────────────────

export function GlobeIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  )
}

export function DownlineIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      {/* Org-chart silhouette — root node up top, two leaves below.
          More semantically clear than a generic "users" icon. */}
      <circle cx="12" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="M12 7v3" />
      <path d="M6 17v-2a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v2" />
    </svg>
  )
}

// ─── Trend / delta ────────────────────────────────────────────────────

export function TrendUpIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  )
}

export function TrendDownIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M14 17h7v-7" />
    </svg>
  )
}

export function DashIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      <path d="M5 12h14" />
    </svg>
  )
}

// ─── Empty states ─────────────────────────────────────────────────────

export function EmptyChartIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 17l5-5 4 4 5-7 4 5" strokeOpacity={0.4} />
      <path d="M3 21h18" />
    </svg>
  )
}

// ─── Misc ─────────────────────────────────────────────────────────────

export function ChevronDownIcon(p: IconProps) {
  return (
    <svg {...base(p)} stroke="currentColor">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function ProgressIcon(p: IconProps) {
  // Used for the "Onboarding Progress" tab — checklist with a partial fill.
  return (
    <svg {...base(p)} stroke="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
      <path d="M8 17h3" />
    </svg>
  )
}
