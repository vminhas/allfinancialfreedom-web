'use client'

import { useEffect, useRef, useState } from 'react'
import type { ClimbTier } from '@/lib/climb-tier'

// Hero point counter with the slide-from-zero animation.
// Uses requestAnimationFrame + easeOutCubic. Honors prefers-reduced-
// motion (snaps to final value, no animation). Subtle ambient
// gold-dust particle layer behind the number gives the "alive"
// Twitch-overlay feel without being distracting.

export default function ClimbCounter({
  total,
  tier,
  newlyAwarded,
}: {
  total: number
  tier: ClimbTier
  // True when an achievement was earned during this session — we
  // briefly amp up the glow + run a fresh count-up animation.
  newlyAwarded: boolean
}) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(total)
      return
    }
    const start = performance.now()
    const duration = 1800
    const from = 0
    const to = total
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [total, reducedMotion])

  return (
    <div style={{ position: 'relative', textAlign: 'center', padding: '32px 16px 16px' }}>
      {!reducedMotion && <ParticleLayer accent={tier.accent} />}
      <div
        style={{
          fontSize: 'clamp(48px, 9vw, 88px)',
          fontWeight: 200,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: '#ffffff',
          textShadow: newlyAwarded ? `0 0 32px ${tier.glow}` : `0 0 24px ${tier.glow}`,
          fontVariantNumeric: 'tabular-nums',
          transition: 'text-shadow 600ms ease',
        }}
      >
        {display.toLocaleString()}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: tier.accent,
        }}
      >
        Lifetime Climb Points
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 999,
          background: tier.gradient,
          color: '#0A1628',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          boxShadow: `0 4px 24px ${tier.glow}`,
        }}
      >
        <span>★</span> {tier.label}
      </div>
    </div>
  )
}

function ParticleLayer({ accent }: { accent: string }) {
  // Pure CSS ambient particle drift behind the counter. ~24
  // fixed-position dots with random delays, all keyed on the same
  // climb-particle-drift keyframe defined in globals.css.
  const dots = Array.from({ length: 24 })
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: 0.55,
      }}
    >
      {dots.map((_, i) => {
        const left = (i * 37) % 100
        const delay = (i * 0.27) % 6
        const dur = 5 + ((i * 0.43) % 4)
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${left}%`,
              bottom: -8,
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 6px ${accent}`,
              animation: `climb-particle-drift ${dur}s linear ${delay}s infinite`,
            }}
          />
        )
      })}
    </div>
  )
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}
