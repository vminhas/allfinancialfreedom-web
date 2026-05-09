// Small inline spinner for "in-progress" indicators across the app.
// Renders an SVG ring with a gap that rotates via the aff-spin
// keyframe in globals.css. Accepts a size + color so it can adapt
// to whatever surface it's on (gold on dark navy, navy on gold,
// muted on a list row, etc).

interface SpinnerProps {
  /** Pixel size; default 14 reads cleanly inline next to 12-14px text. */
  size?: number
  /** Stroke color. Default brand gold. */
  color?: string
  /** Stroke thickness. */
  strokeWidth?: number
  /** Pass to override the wrapper style (e.g. add margin / vertical-align). */
  style?: React.CSSProperties
  /** Optional aria-label for screen readers; default 'Loading'. */
  label?: string
}

export default function Spinner({
  size = 14,
  color = '#C9A96E',
  strokeWidth = 2,
  style,
  label = 'Loading',
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        animation: 'aff-spin 0.8s linear infinite',
        ...style,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle
          cx="12" cy="12" r="9"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={strokeWidth}
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

// Three pulsing dots ("Analyzing..." companion). Use when you want
// motion that doesn't compete with the spinner — e.g. on a small
// inline chip where rotation reads as overkill.
export function PulseDots({ color = '#C9A96E', size = 4, gap = 3 }: { color?: string; size?: number; gap?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
            animation: `aff-pulse-dots 1.2s ease-in-out ${i * 0.16}s infinite`,
          }}
        />
      ))}
    </span>
  )
}
