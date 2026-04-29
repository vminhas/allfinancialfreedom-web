'use client'

import { useEffect, useRef, useState } from 'react'

// iOS Safari hides its native pull-to-refresh once a page is launched in
// standalone mode (i.e. from the home screen via "Add to Home Screen"), so
// we provide our own. Listens for touchstart at scrollTop=0, tracks the pull
// distance, and triggers a reload when released past the threshold.
//
// Renders nothing visible on desktop; on mobile, shows a small gold spinner
// that grows as the user pulls. Doesn't get in the way of scroll otherwise.

const TRIGGER_PX = 80
const MAX_PULL_PX = 130

interface Props {
  onRefresh?: () => Promise<void> | void
}

export default function PullToRefresh({ onRefresh }: Props) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      // Only arm the gesture when the page is scrolled to the top. Otherwise
      // the user is just scrolling normally and we mustn't interfere.
      if (window.scrollY > 2) return
      startYRef.current = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current == null || refreshing) return
      const dy = e.touches[0].clientY - startYRef.current
      if (dy <= 0) {
        setPull(0)
        return
      }
      // Apply diminishing returns so the pull feels weighted, like iOS.
      const eased = Math.min(MAX_PULL_PX, dy * 0.55)
      setPull(eased)
    }

    const onTouchEnd = async () => {
      if (startYRef.current == null) return
      const distance = pull
      startYRef.current = null
      if (distance >= TRIGGER_PX && !refreshing) {
        setRefreshing(true)
        try {
          if (onRefresh) await onRefresh()
          // Even when a custom callback is provided we still hard-reload at
          // the end — easier than wiring per-page refetch hooks across the
          // checklist, carriers, partners, calls, etc. tabs. A reload is
          // ~250ms and matches what an admin would do manually anyway.
          window.location.reload()
        } catch {
          setRefreshing(false)
          setPull(0)
        }
      } else {
        setPull(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [pull, refreshing, onRefresh])

  if (pull <= 0 && !refreshing) return null

  const progress = Math.min(1, pull / TRIGGER_PX)
  const ready = pull >= TRIGGER_PX
  const shouldSpin = refreshing
  const top = refreshing ? 24 : Math.min(pull - 28, 60)

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 36, height: 36,
        borderRadius: '50%',
        background: '#0F1E33',
        border: `1px solid ${ready ? '#C9A96E' : 'rgba(201,169,110,0.4)'}`,
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'top 0.18s ease, border-color 0.18s ease',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 18, height: 18,
          border: '2px solid rgba(201,169,110,0.25)',
          borderTopColor: '#C9A96E',
          borderRadius: '50%',
          transform: shouldSpin ? 'rotate(0deg)' : `rotate(${progress * 270}deg)`,
          animation: shouldSpin ? 'aff-ptr-spin 0.7s linear infinite' : 'none',
        }}
      />
      <style>{`@keyframes aff-ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
