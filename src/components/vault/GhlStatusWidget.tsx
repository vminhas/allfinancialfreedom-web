'use client'

import { useEffect, useState } from 'react'

interface GhlStatus {
  connected: boolean
  locationName?: string
  contactCount?: number
  error?: string
}

export default function GhlStatusWidget() {
  const [status, setStatus] = useState<GhlStatus | null>(null)
  const [loading, setLoading] = useState(true)

  async function check() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ghl-status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ connected: false, error: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { check() }, [])

  return (
    <div style={{
      background: '#142D48', borderRadius: 6, padding: '20px 28px',
      border: `1px solid ${status?.connected ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: loading ? '#6B8299' : status?.connected ? '#4ade80' : '#f87171',
          boxShadow: loading ? 'none' : status?.connected ? '0 0 8px rgba(74,222,128,0.5)' : '0 0 8px rgba(248,113,113,0.4)',
        }} />
        <div>
          <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 2px' }}>
            GoHighLevel
          </p>
          <p style={{ color: '#ffffff', fontSize: 14, margin: 0 }}>
            {loading
              ? 'Checking connection...'
              : status?.connected
                ? `${status.locationName ?? 'Connected'} · ${status.contactCount?.toLocaleString() ?? '—'} contacts`
                : status?.error ?? 'Not connected'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {!status?.connected && !loading && (
          <a href="/vault/settings" style={{
            padding: '7px 16px', background: '#C9A96E', color: '#142D48',
            textDecoration: 'none', borderRadius: 3, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Configure
          </a>
        )}
        <button
          onClick={check}
          disabled={loading}
          style={{
            padding: '7px 16px', background: 'transparent', border: '1px solid rgba(201,169,110,0.3)',
            color: '#C9A96E', borderRadius: 3, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '...' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
