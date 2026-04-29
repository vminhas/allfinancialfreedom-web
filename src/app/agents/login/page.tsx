'use client'

import { Suspense, useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

// Wrap useSearchParams in Suspense per Next.js 15 build requirements;
// without it the route fails static generation. Inner component holds
// the actual login UI.
export default function AgentLoginPage() {
  return (
    <Suspense fallback={null}>
      <AgentLoginInner />
    </Suspense>
  )
}

function AgentLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // Whether the Google provider is actually registered server-side. If
  // GOOGLE_CLIENT_ID isn't set in the environment, the provider isn't
  // there and signIn('google', ...) silently fails. Hide the button in
  // that case rather than showing a dead button.
  const [googleAvailable, setGoogleAvailable] = useState(false)

  useEffect(() => {
    fetch('/api/auth/providers')
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, { id: string }> | null) => {
        if (d && 'google' in d) setGoogleAvailable(true)
      })
      .catch(() => {})
  }, [])

  // NextAuth sends ?error=... back to the login page when an OAuth
  // sign-in is rejected. Surface a friendly message instead of the raw
  // code. The most likely case is "Google identity has no AgentUser
  // here yet" - i.e. the agent typed the wrong Google account or
  // hasn't been invited to AFF yet.
  useEffect(() => {
    const err = searchParams.get('error')
    if (!err) return
    if (err === 'AccessDenied' || err === 'OAuthAccountNotLinked') {
      setError("We couldn't find an agent account for that Google email. If you were just invited, sign in once with the password from your welcome email; you can use Google after that. Otherwise contact your trainer or AFF support.")
    } else if (err === 'AccountInactive') {
      setError('Your account has been deactivated. If you believe this is an error, please contact your trainer or AFF support.')
    } else if (err === 'OAuthSignin' || err === 'OAuthCallback' || err === 'Callback') {
      setError(`Google sign-in failed (${err}). Make sure the redirect URI in Google Cloud Console matches this domain exactly, including https://.`)
    } else if (err === 'Configuration') {
      setError("Google sign-in isn't configured on the server. Reach out to support.")
    } else {
      setError(`Sign-in error: ${err}`)
    }
  }, [searchParams])

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
    if (res?.error === 'AccountInactive') {
      setError('Your account has been deactivated. If you believe this is an error, please contact your trainer or AFF support.')
      setLoading(false)
    } else if (res?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/agents')
    }
  }

  const signInWithGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    // redirect:false so we can inspect the response. If the OAuth init
    // succeeded NextAuth returns a `url` to navigate to (Google's
    // consent screen). If it didn't, we surface the failure inline
    // instead of leaving the user on a stuck page.
    try {
      const res = await signIn('google', { redirect: false, callbackUrl: '/agents' })
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
      // Shouldn't reach here, but just in case.
      setError('Unexpected response from Google sign-in. Try again or use email/password.')
      setGoogleLoading(false)
    } catch (e) {
      setError(`Google sign-in error: ${e instanceof Error ? e.message : String(e)}`)
      setGoogleLoading(false)
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
      backgroundImage: "linear-gradient(rgba(10,22,40,0.78), rgba(10,22,40,0.92)), url('/brand/login-hero.jpg')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'rgba(19,34,56,0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(201,169,110,0.18)',
        borderRadius: 8,
        padding: 40,
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
            All Financial Freedom
          </div>
          <div style={{ fontSize: 20, fontWeight: 300, color: '#ffffff' }}>Agent Portal</div>
          <div style={{ width: 40, height: 1, background: 'rgba(201,169,110,0.3)', margin: '16px auto 0' }} />
        </div>

        {/* Google sign-in. Surfaced above email/password because it's */}
        {/* the friendlier path on mobile and bypasses the email-case */}
        {/* footgun entirely (Google always returns a canonical email). */}
        {/* Hidden when the provider isn't registered server-side (e.g. */}
        {/* GOOGLE_CLIENT_ID env var missing) so we never show a dead */}
        {/* button. */}
        {googleAvailable && (<>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={googleLoading}
          style={{
            width: '100%',
            background: '#ffffff',
            color: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.7)',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(201,169,110,0.15)' }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6B8299' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(201,169,110,0.15)' }} />
        </div>
        </>)}

        {/* Inline error banner - visible above the form so the user */}
        {/* sees Google sign-in failures without scrolling. */}
        {error && (
          <div style={{ fontSize: 12, color: '#f87171', padding: '10px 12px', marginBottom: 18, background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

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

          {/* Error banner is rendered above the form (see top of */}
          {/* render) so credentials AND Google failures both show. */}

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
