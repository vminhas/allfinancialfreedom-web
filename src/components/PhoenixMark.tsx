// AFF phoenix mark, hand-crafted SVG. Used by the home-screen icons
// (apple-icon.tsx) and reusable anywhere the brand bird should appear.
// Pass a `fill` to tint it; defaults to the AFF gold.

interface Props {
  size?: number
  fill?: string
}

export function PhoenixMark({ size = 120, fill = '#C9A96E' }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 220"
      width={size}
      height={size * (220 / 200)}
      fill={fill}
      aria-label="All Financial Freedom phoenix"
    >
      {/* Head + hooked beak */}
      <path d="M 100 32 C 95 32 90 35 90 40 L 90 47 C 90 52 94 55 100 55 L 106 54 L 112 52 L 117 51 L 114 54 L 110 56 L 105 58 L 100 59 C 93 59 88 56 87 51 L 87 41 C 87 34 93 30 100 30 Z" />
      {/* Body / chest */}
      <path d="M 92 58 L 108 58 L 114 78 L 117 108 L 114 132 L 100 148 L 86 132 L 83 108 L 86 78 Z" />
      {/* Left wing */}
      <path d="M 90 65 C 73 56 56 44 38 33 C 22 25 8 28 5 42 C 4 58 14 78 33 90 C 51 100 72 99 87 92 L 91 84 Z" />
      {/* Right wing — mirror of left */}
      <path d="M 110 65 C 127 56 144 44 162 33 C 178 25 192 28 195 42 C 196 58 186 78 167 90 C 149 100 128 99 113 92 L 109 84 Z" />
      {/* Tail feathers — five-wedge fan */}
      <path d="M 100 148 L 96 202 L 100 196 L 104 202 Z" />
      <path d="M 94 144 L 83 196 L 92 192 L 96 167 Z" />
      <path d="M 106 144 L 117 196 L 108 192 L 104 167 Z" />
      <path d="M 88 137 L 71 188 L 84 187 L 92 161 Z" />
      <path d="M 112 137 L 129 188 L 116 187 L 108 161 Z" />
    </svg>
  )
}
