'use client'

import { useEffect, useState } from 'react'
import { TrophyIcon, ProgressIcon } from './leaderboard-icons'

// Two-tab shell for /agents/leaderboard. Tab 1 ("Production") is the new
// production-leaderboard view; Tab 2 ("Progression Matrix") is the
// existing checklist-completion matrix (kept under that name because
// it covers all phases, not just onboarding). State syncs to the URL
// hash so refreshes and shared links preserve the active tab.

export type LeaderboardTab = 'production' | 'progression'

export function LeaderboardTabsBar({
  active, setActive,
}: { active: LeaderboardTab; setActive: (t: LeaderboardTab) => void }) {
  return (
    <div style={{
      display: 'flex', gap: 4,
      marginBottom: 20,
      padding: 4,
      background: 'rgba(0,0,0,0.25)',
      border: '1px solid rgba(201,169,110,0.12)',
      borderRadius: 8,
      width: 'fit-content',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
    }}>
      <TabButton active={active === 'production'} onClick={() => setActive('production')} icon={<TrophyIcon size={14} />}>
        Production
      </TabButton>
      <TabButton active={active === 'progression'} onClick={() => setActive('progression')} icon={<ProgressIcon size={14} />}>
        Progression Matrix
      </TabButton>
    </div>
  )
}

function TabButton({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '8px 16px',
        fontSize: 12, fontWeight: active ? 700 : 500,
        color: active ? '#142D48' : '#9BB0C4',
        background: active
          ? 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)'
          : 'transparent',
        border: 'none', borderRadius: 5,
        cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px rgba(201,169,110,0.4)' : 'none',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex' }}>{icon}</span>
      {children}
    </button>
  )
}

// Hook for hash-synced tab state. Default tab is Production — that's
// what the word "leaderboard" implies to most agents (production
// rankings, not onboarding completion). The onboarding view is still
// one click away.
// Default tab is Progression Matrix because that's what's most useful
// to the average agent on a daily basis (where am I in my checklist?
// what's left to hit MD?). Production rankings are one click away for
// agents who want to compete and a different mental mode anyway.
export function useTabFromHash(defaultTab: LeaderboardTab = 'progression') {
  const [tab, setTab] = useState<LeaderboardTab>(defaultTab)

  useEffect(() => {
    const sync = () => {
      const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
      if (h === 'progression' || h === 'production') setTab(h)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const update = (t: LeaderboardTab) => {
    setTab(t)
    if (typeof window !== 'undefined') {
      const target = `#${t}`
      if (window.location.hash !== target) {
        history.replaceState(null, '', target)
      }
    }
  }

  return [tab, update] as const
}
