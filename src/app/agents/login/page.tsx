'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function AgentLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('agent-credentials', {
      email: email.toLowerCase(),
      password,
      redirect: false,
      callbackUrl: '/agents',
    })
    if (res?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/agents')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: '#0A1628',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: '#132238',
        border: '1px solid rgba(201,169,110,0.12)',
        borderRadius: 8,
        padding: 40,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
            All Financial Freedom
          </div>
          <div style={{ fontSize: 20, fontWeight: 300, color: '#ffffff' }}>Agent Portal</div>
          <div style={{ width: 40, height: 1, background: 'rgba(201,169,110,0.3)', margin: '16px auto 0' }} />
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0A1628',
                border: '1px solid rgba(201,169,110,0.2)',
                borderRadius: 4, color: '#9BB0C4',
                padding: '10px 14px', fontSize: 13,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0A1628',
                border: '1px solid rgba(201,169,110,0.2)',
                borderRadius: 4, color: '#9BB0C4',
                padding: '10px 14px', fontSize: 13,
              }}
            />
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
              marginTop: 8,
              width: '100%',
              background: loading ? '#8a7249' : '#C9A96E',
              color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: '12px', fontSize: 11,
              fontWeight: 700, letterSpacing: '0.15em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#4B5563' }}>
          Need access? Contact your trainer or recruiter.
        </p>
      </div>
    </div>
  )
}
