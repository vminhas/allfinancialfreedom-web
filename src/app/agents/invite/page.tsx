'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function InviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  useEffect(() => {
    setTokenValid(!!token)
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/agents/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json() as { ok?: boolean; error?: string; email?: string }
    if (!res.ok) { setError(data.error ?? 'Failed'); setLoading(false); return }
    router.push('/agents/login?activated=1')
  }

  if (!tokenValid) {
    return (
      <div style={{ textAlign: 'center', color: '#f87171', fontSize: 13 }}>
        Invalid or missing invite token. Please contact your trainer.
      </div>
    )
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const,
    background: '#0A1628',
    border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#9BB0C4',
    padding: '10px 14px', fontSize: 13,
  }
  const fieldLabel = {
    display: 'block', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.15em', textTransform: 'uppercase' as const,
    color: '#C9A96E', marginBottom: 6,
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={fieldLabel}>New Password</label>
        <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={fieldLabel}>Confirm Password</label>
        <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} />
      </div>
      {error && (
        <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.15)' }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: 8, width: '100%',
          background: loading ? '#8a7249' : '#C9A96E',
          color: '#142D48', border: 'none', borderRadius: 4,
          padding: '12px', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Setting up...' : 'Activate My Account'}
      </button>
    </form>
  )
}

export default function InvitePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0A1628' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#132238', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 8, padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
            All Financial Freedom
          </div>
          <div style={{ fontSize: 20, fontWeight: 300, color: '#ffffff' }}>Welcome to Your Portal</div>
          <p style={{ fontSize: 13, color: '#6B8299', marginTop: 8 }}>Set your password to get started.</p>
          <div style={{ width: 40, height: 1, background: 'rgba(201,169,110,0.3)', margin: '16px auto 0' }} />
        </div>
        <Suspense fallback={<div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>}>
          <InviteForm />
        </Suspense>
      </div>
    </div>
  )
}
