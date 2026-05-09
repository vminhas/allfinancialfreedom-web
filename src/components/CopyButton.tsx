'use client'

import { useState } from 'react'

// Small copy-to-clipboard control. Shows a clipboard glyph by
// default and flips to a green check for ~1.4s after a successful
// copy, so the admin gets unmistakable visual confirmation that
// the value landed on their clipboard.

export default function CopyButton({
  value,
  size = 14,
  ariaLabel,
}: {
  value: string
  size?: number
  ariaLabel?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
      setTimeout(() => setState('idle'), 1400)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 1400)
    }
  }

  const color = state === 'copied' ? '#4ade80' : state === 'error' ? '#f87171' : '#9BB0C4'
  const glyph = state === 'copied' ? '✓' : state === 'error' ? '✕' : '⎘'

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? `Copy ${value}`}
      title={state === 'copied' ? 'Copied' : `Copy ${value}`}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        marginLeft: 6,
        cursor: 'pointer',
        color,
        fontSize: size,
        lineHeight: 1,
        verticalAlign: 'middle',
        transition: 'color 150ms ease, transform 150ms ease',
        transform: state === 'copied' ? 'scale(1.15)' : 'scale(1)',
      }}
    >
      {glyph}
    </button>
  )
}
