'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function VaultLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid credentials.')
      setLoading(false)
    } else {
      // Hard navigation ensures the new session cookie is read fresh
      window.location.href = '/vault'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C1E30' }}>
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-10">
          <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
            All Financial Freedom
          </p>
          <h1 style={{ color: '#ffffff', fontSize: 22, fontWeight: 300, margin: 0, letterSpacing: '-0.01em' }}>
            Vault
          </h1>
          <div style={{ width: 32, height: 1, background: '#C9A96E', margin: '12px auto 0' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#142D48', borderRadius: 6, padding: '36px 32px' }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%', padding: '10px 12px', background: '#0C1E30',
                border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
                color: '#ffffff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%', padding: '10px 12px', background: '#0C1E30',
                border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
                color: '#ffffff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', background: loading ? '#8a7249' : '#C9A96E',
              color: '#142D48', border: 'none', borderRadius: 4, fontSize: 12,
              fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
