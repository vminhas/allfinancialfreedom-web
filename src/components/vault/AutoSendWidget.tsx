'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  enabled: boolean
  sentToday: number
  dailyLimit: number
  queueDepth: number
  week: number
  ramp: number[]
}

export default function AutoSendWidget({ enabled, sentToday, dailyLimit, queueDepth, week, ramp }: Props) {
  const [on, setOn] = useState(enabled)
  const [toggling, setToggling] = useState(false)

  async function handleToggle() {
    setToggling(true)
    const res = await fetch('/api/admin/auto-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !on }),
    })
    if (res.ok) setOn(v => !v)
    setToggling(false)
  }

  const progress = dailyLimit > 0 ? Math.min((sentToday / dailyLimit) * 100, 100) : 0
  const daysToEmpty = dailyLimit > 0 ? Math.ceil(queueDepth / dailyLimit) : 0

  return (
    <div style={{ background: '#142D48', borderRadius: 6, border: `1px solid ${on ? 'rgba(74,222,128,0.2)' : 'rgba(201,169,110,0.1)'}`, marginBottom: 24 }}>
      <div style={{ padding: '16px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 2px' }}>
            Auto-Send Queue
          </p>
          <p style={{ color: '#6B8299', fontSize: 11, margin: 0 }}>
            Sends daily at 9am ET — ramping up volume each week to build sender reputation
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: on ? '#4ade80' : '#6B8299', fontSize: 11, fontWeight: 600 }}>
            {on ? 'ON' : 'OFF'}
          </span>
          <button
            onClick={handleToggle}
            disabled={toggling}
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: toggling ? 'not-allowed' : 'pointer',
              background: on ? '#4ade80' : '#2a4a6a', position: 'relative', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18,
              borderRadius: '50%', background: '#ffffff', transition: 'left 0.2s',
            }} />
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          <div>
            <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Sent Today</p>
            <p style={{ color: '#ffffff', fontSize: 22, fontWeight: 300, margin: 0 }}>{sentToday}<span style={{ color: '#4B5563', fontSize: 13 }}>/{dailyLimit}</span></p>
          </div>
          <div>
            <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>In Queue</p>
            <p style={{ color: '#ffffff', fontSize: 22, fontWeight: 300, margin: 0 }}>{queueDepth.toLocaleString()}</p>
          </div>
          <div>
            <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Current Week</p>
            <p style={{ color: '#C9A96E', fontSize: 22, fontWeight: 300, margin: 0 }}>Week {week}</p>
          </div>
          <div>
            <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Est. Complete</p>
            <p style={{ color: '#ffffff', fontSize: 22, fontWeight: 300, margin: 0 }}>{daysToEmpty > 0 ? `${daysToEmpty}d` : '—'}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ width: '100%', background: '#0C1E30', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#4ade80', borderRadius: 4, width: `${progress}%`, transition: 'width 0.5s' }} />
          </div>
          <p style={{ color: '#4B5563', fontSize: 10, margin: '4px 0 0' }}>Today&apos;s batch: {sentToday} of {dailyLimit} sent</p>
        </div>

        {/* Ramp schedule */}
        <div style={{ display: 'flex', gap: 6 }}>
          {ramp.map((limit, i) => (
            <div key={i} style={{
              flex: 1, padding: '8px 10px', borderRadius: 4, textAlign: 'center',
              background: i === week - 1 ? 'rgba(201,169,110,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${i === week - 1 ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.05)'}`,
            }}>
              <p style={{ color: '#4B5563', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 2px' }}>Wk {i + 1}</p>
              <p style={{ color: i === week - 1 ? '#C9A96E' : '#6B8299', fontSize: 13, fontWeight: i === week - 1 ? 600 : 400, margin: 0 }}>{limit}/day</p>
            </div>
          ))}
          <div style={{
            flex: 1, padding: '8px 10px', borderRadius: 4, textAlign: 'center',
            background: week > ramp.length ? 'rgba(201,169,110,0.12)' : 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <p style={{ color: '#4B5563', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 2px' }}>Wk 5+</p>
            <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>500/day</p>
          </div>
        </div>

        {!on && (
          <p style={{ color: '#f59e0b', fontSize: 11, margin: '16px 0 0' }}>
            Auto-send is off. Set a default template in <Link href="/vault/outreach" style={{ color: '#C9A96E' }}>Outreach</Link> then enable it here.
          </p>
        )}
      </div>
    </div>
  )
}
