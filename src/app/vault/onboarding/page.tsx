'use client'

import { useState, useEffect, useCallback } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface Laggard {
  agentProfileId: string
  name: string
  email: string
  recruiterId: string | null
  daysSinceStart: number
  joinedDiscord: boolean
  completedOnboarding: boolean
  trainingExcluded: boolean
}

export default function OnboardingWatchPage() {
  const isMobile = useIsMobile()
  const [laggards, setLaggards] = useState<Laggard[]>([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/onboarding-watch')
    const d = await res.json() as { laggards: Laggard[] }
    setLaggards(d.laggards ?? [])
  }, [])

  useEffect(() => {
    fetch('/api/admin/onboarding-watch').then(r => r.json())
      .then((d: { laggards: Laggard[] }) => { setLaggards(d.laggards ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const postNow = async () => {
    setPosting(true)
    setFlash(null)
    try {
      const res = await fetch('/api/admin/onboarding-watch', { method: 'POST' })
      const d = await res.json() as { count: number; posted: boolean }
      setFlash(
        d.count === 0
          ? 'Nobody is behind. Nothing posted.'
          : d.posted
            ? `Posted ${d.count} agent${d.count === 1 ? '' : 's'} to the admin activity channel.`
            : `Found ${d.count} behind, but the admin activity channel isn't configured (DISCORD_ADMIN_CHANNEL_ID).`,
      )
      await refresh()
    } catch {
      setFlash('Failed to run the report.')
    }
    setPosting(false)
  }

  const cell: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#C7D3E0', borderBottom: '1px solid rgba(255,255,255,0.05)' }
  const head: React.CSSProperties = { padding: '8px 12px', fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left', borderBottom: '1px solid rgba(201,169,110,0.2)' }
  const yes = <span style={{ color: '#4ade80', fontWeight: 700 }}>✓</span>
  const no = <span style={{ color: '#ef4444', fontWeight: 700 }}>✗</span>

  return (
    <div style={{ padding: isMobile ? 16 : '24px 32px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0 }}>Onboarding Watch</h1>
          <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4, maxWidth: 560, lineHeight: 1.5 }}>
            Agents past their first week who still haven&apos;t joined Discord and/or completed onboarding training. A digest also posts here automatically each day.
          </p>
        </div>
        <button
          onClick={postNow}
          disabled={posting || loading}
          style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: posting ? 'wait' : 'pointer', opacity: posting || loading ? 0.7 : 1, whiteSpace: 'nowrap' }}
        >
          {posting ? 'Running...' : 'Post to admin activity now'}
        </button>
      </div>

      {flash && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 6, fontSize: 13, color: '#C9A96E' }}>
          {flash}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6B8299' }}>Loading...</div>
      ) : laggards.length === 0 ? (
        <div style={{ color: '#4ade80', fontSize: 14, textAlign: 'center', padding: 40, background: '#132238', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 6 }}>
          Everyone past their first week has joined Discord and completed onboarding training.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#132238', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={head}>Agent</th>
                <th style={head}>Days In</th>
                <th style={{ ...head, textAlign: 'center' }}>Discord</th>
                <th style={{ ...head, textAlign: 'center' }}>Onboarding</th>
                <th style={head}>Recruiter</th>
              </tr>
            </thead>
            <tbody>
              {laggards.map(l => (
                <tr key={l.agentProfileId}>
                  <td style={cell}>
                    <div style={{ color: '#ffffff', fontWeight: 600 }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: '#6B8299' }}>{l.email}</div>
                  </td>
                  <td style={{ ...cell, color: l.daysSinceStart >= 14 ? '#ef4444' : '#FBBF24', fontWeight: 700 }}>
                    {l.daysSinceStart}d
                  </td>
                  <td style={{ ...cell, textAlign: 'center' }}>{l.joinedDiscord ? yes : no}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    {l.trainingExcluded ? <span style={{ color: '#6B8299' }} title="Excluded from training tracking">&ndash;</span> : l.completedOnboarding ? yes : no}
                  </td>
                  <td style={{ ...cell, color: '#9BB0C4' }}>{l.recruiterId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
