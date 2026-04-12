'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function UnsubscribeForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const e = searchParams.get('email')
    if (e) setEmail(e)
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setDone(true)
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9B8A6A', marginBottom: 12 }}>All Financial Freedom</p>

      {done ? (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 400, color: '#1a1a1a', margin: '0 0 16px' }}>You&apos;ve been unsubscribed.</h1>
          <p style={{ color: '#666', fontSize: 15, lineHeight: 1.7 }}>
            We&apos;ve removed {email} from our list. You won&apos;t hear from us again.
          </p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 400, color: '#1a1a1a', margin: '0 0 12px' }}>Unsubscribe</h1>
          <p style={{ color: '#666', fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
            Confirm your email below and we&apos;ll remove you from all future outreach immediately.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              style={{
                width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 4,
                fontSize: 14, marginBottom: 12, boxSizing: 'border-box' as const, outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '10px', background: '#1a1a1a', color: '#fff',
                border: 'none', borderRadius: 4, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Removing...' : 'Unsubscribe me'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeForm />
    </Suspense>
  )
}
