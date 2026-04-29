'use client'

import { Suspense, useEffect, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

interface SessionInfo {
  user?: {
    email?: string
    name?: string
    role?: string
  }
}

// Wrap useSearchParams in Suspense per Next.js 15 build requirements.
export default function VaultLoginPage() {
  return (
    <Suspense fallback={null}>
      <VaultLoginInner />
    </Suspense>
  )
}

function VaultLoginInner() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // Server-side check that Google is actually registered. Hides the
  // button if GOOGLE_CLIENT_ID isn't set so we don't show a dead button.
  const [googleAvailable, setGoogleAvailable] = useState(false)
  // Existing session, if any. We surface this at the top of the login
  // page because the most common stuck-loop scenario is "user signed
  // in via Google as an agent, middleware bounces them back here, but
  // the cookie is still set so credentials login won't fix it." Showing
  // the current identity + a Sign out button breaks the loop in one
  // click.
  const [existingSession, setExistingSession] = useState<SessionInfo | null>(null)

  useEffect(() => {
    fetch('/api/auth/providers')
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, { id: string }> | null) => {
        if (d && 'google' in d) setGoogleAvailable(true)
      })
      .catch(() => {})
    fetch('/api/auth/session')
      .then(r => r.ok ? r.json() : null)
      .then((d: SessionInfo | null) => {
        if (d?.user?.email) setExistingSession(d)
      })
      .catch(() => {})
  }, [])

  // NextAuth posts an ?error= back to the login page when an OAuth
  // sign-in fails. Most likely cause is "Google identity isn't in the
  // AdminUser or AgentUser tables yet".
  useEffect(() => {
    const err = searchParams.get('error')
    if (!err) return
    if (err === 'AccessDenied' || err === 'OAuthAccountNotLinked') {
      setError("This Google account isn't authorized for the AFF vault. Vault access is limited to admins and licensing coordinators. If you think this is a mistake, email operations@allfinancialfreedom.com.")
    } else if (err === 'OAuthSignin' || err === 'OAuthCallback' || err === 'Callback') {
      setError(`Google sign-in failed (${err}). Make sure the redirect URI in Google Cloud Console matches this domain exactly, including https://.`)
    } else if (err === 'Configuration') {
      setError("Google sign-in isn't configured on the server. Reach out to operations@allfinancialfreedom.com.")
    } else {
      setError(`Sign-in error: ${err}`)
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (!result || result.error) {
      setError('Invalid credentials. Please check your email and password.')
      setLoading(false)
    } else if (result.ok) {
      // Hard navigation ensures the new admin session cookie is read fresh
      window.location.replace('/vault')
    } else {
      setError('Sign in failed, please try again.')
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    setError('')
    setGoogleLoading(true)
    // redirect:false lets us inspect the response. If init succeeded
    // NextAuth returns a `url` to navigate to (Google's consent
    // screen). Failures get surfaced inline instead of leaving the
    // user on a stuck page.
    try {
      const res = await signIn('google', { redirect: false, callbackUrl: '/vault' })
      if (!res) {
        setError('Google sign-in did not respond. Make sure GOOGLE_CLIENT_ID is set in the environment and the deployment was rebuilt.')
        setGoogleLoading(false)
        return
      }
      if (res.error) {
        setError(`Google sign-in failed: ${res.error}`)
        setGoogleLoading(false)
        return
      }
      if (res.url) {
        window.location.href = res.url
        return
      }
      setError('Unexpected response from Google sign-in. Try again or use email/password.')
      setGoogleLoading(false)
    } catch (e) {
      setError(`Google sign-in error: ${e instanceof Error ? e.message : String(e)}`)
      setGoogleLoading(false)
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
          {/* Existing-session banner. If you're signed in but the */}
          {/* middleware bounced you back here (most likely because */}
          {/* your role isn't admin/LC), show who you're signed in as */}
          {/* and offer a one-click sign out so the loop breaks. */}
          {existingSession?.user && (
            <div style={{
              fontSize: 12, color: '#9BB0C4',
              padding: '12px 14px', marginBottom: 18,
              background: 'rgba(245,158,11,0.06)',
              borderRadius: 4, border: '1px solid rgba(245,158,11,0.25)',
              lineHeight: 1.5,
            }}>
              <div style={{ marginBottom: 8 }}>
                You&apos;re currently signed in as <strong style={{ color: '#fff' }}>{existingSession.user.email}</strong>
                {existingSession.user.role ? <> (role: <strong style={{ color: '#fff' }}>{existingSession.user.role}</strong>)</> : null}.
                {existingSession.user.role !== 'admin' && existingSession.user.role !== 'licensing_coordinator' && (
                  <> The vault requires an admin or licensing-coordinator account; sign out and try a different one.</>
                )}
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/vault/login' })}
                style={{
                  background: 'transparent', color: '#F59E0B',
                  border: '1px solid rgba(245,158,11,0.5)', borderRadius: 3,
                  padding: '6px 12px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Sign out and start over
              </button>
            </div>
          )}

          {/* Inline error banner for both Google and credentials failures. */}
          {/* Sits above the Google button so login-flow errors land here */}
          {/* regardless of which path the user tried. */}
          {error && (
            <div style={{ fontSize: 12, color: '#f87171', padding: '10px 12px', marginBottom: 18, background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {/* Google sign-in. Hidden when the provider isn't registered */}
          {/* server-side (e.g. GOOGLE_CLIENT_ID env var missing) so we */}
          {/* never show a dead button. */}
          {googleAvailable && (<>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={googleLoading}
            style={{
              width: '100%',
              background: '#ffffff',
              color: '#1a1a1a',
              border: 'none',
              borderRadius: 4,
              padding: '11px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: googleLoading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              marginBottom: 18,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.7 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.4 4.5 9.8 8.7 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 14-5.4l-6.5-5.5c-2 1.4-4.5 2.4-7.5 2.4-5.2 0-9.5-3.3-11.2-7.9l-6.5 5C9.7 39.2 16.3 43.5 24 43.5z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.5 5.5c-.5.5 7-5 7-15.1 0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            {googleLoading ? 'Redirecting...' : 'Sign in with Google'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(201,169,110,0.15)' }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6B8299' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(201,169,110,0.15)' }} />
          </div>
          </>)}

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

          {/* Error banner is rendered above the Google button (top of */}
          {/* form) so credentials AND Google failures both surface. */}

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
