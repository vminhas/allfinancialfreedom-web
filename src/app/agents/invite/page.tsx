'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

const PORTAL_FEATURES = [
  { icon: '◑', title: 'Phase Roadmap', desc: 'Your 5-phase journey to financial freedom, one checkbox at a time.' },
  { icon: '◈', title: 'Carrier Status', desc: 'Track your appointments with all 16 carriers — know exactly where you stand.' },
  { icon: '✦', title: 'Business Tools', desc: 'Log business partners, policies written, and call activity all in one place.' },
]

const PHASES = [
  { n: 1, label: 'Foundation' },
  { n: 2, label: 'Field Training' },
  { n: 3, label: 'CFT Certification' },
  { n: 4, label: 'Growth' },
  { n: 5, label: 'Leadership' },
]

function InviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [firstName, setFirstName] = useState<string | null>(null)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'welcome' | 'password'>('welcome')

  useEffect(() => {
    if (!token) { setTokenValid(false); return }
    fetch(`/api/agents/invite-info?token=${token}`)
      .then(r => r.json())
      .then((d: { firstName?: string; error?: string }) => {
        if (d.error) { setTokenValid(false); return }
        setFirstName(d.firstName ?? null)
        setTokenValid(true)
      })
      .catch(() => setTokenValid(false))
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
    const data = await res.json() as { ok?: boolean; error?: string }
    if (!res.ok) { setError(data.error ?? 'Failed'); setLoading(false); return }
    router.push('/agents/login?activated=1')
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const,
    background: '#0A1628',
    border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#9BB0C4',
    padding: '10px 14px', fontSize: 13,
    outline: 'none',
  }
  const labelStyle = {
    display: 'block', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.15em', textTransform: 'uppercase' as const,
    color: '#C9A96E', marginBottom: 6,
  }

  if (tokenValid === null) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{ color: '#6B8299', fontSize: 13 }}>Verifying your invite...</div>
      </div>
    )
  }

  if (!tokenValid) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠</div>
        <div style={{ color: '#f87171', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          This invite link is invalid or has expired.
        </div>
        <div style={{ color: '#6B8299', fontSize: 12, lineHeight: 1.6 }}>
          Invite links expire after 72 hours.<br />
          Contact your trainer or recruiter to get a new one.
        </div>
      </div>
    )
  }

  // ── Step 1: Welcome / What's waiting for you ──────────────────────────────
  if (step === 'welcome') {
    return (
      <div>
        {/* Greeting */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            fontSize: 22, fontWeight: 300, color: '#ffffff', marginBottom: 6, lineHeight: 1.3,
          }}>
            {firstName ? `Welcome, ${firstName}!` : 'Welcome!'}
          </div>
          <p style={{ fontSize: 13, color: '#6B8299', margin: 0, lineHeight: 1.6 }}>
            Your Agent Portal is ready. Here&rsquo;s a quick look at everything inside before you set your password.
          </p>
        </div>

        {/* Feature tiles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {PORTAL_FEATURES.map(f => (
            <div key={f.icon} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: 'rgba(201,169,110,0.04)',
              border: '1px solid rgba(201,169,110,0.1)',
              borderRadius: 6, padding: '12px 14px',
            }}>
              <span style={{ color: '#C9A96E', fontSize: 18, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{f.icon}</span>
              <div>
                <div style={{ color: '#ffffff', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{f.title}</div>
                <div style={{ color: '#6B8299', fontSize: 11, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Phase roadmap preview */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Your Journey — 5 Phases
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {PHASES.map((p, i) => (
              <div key={p.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: p.n === 1 ? '#C9A96E' : 'rgba(201,169,110,0.1)',
                    border: `1px solid ${p.n === 1 ? '#C9A96E' : 'rgba(201,169,110,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    color: p.n === 1 ? '#142D48' : 'rgba(201,169,110,0.4)',
                  }}>{p.n}</div>
                  <div style={{ fontSize: 9, color: p.n === 1 ? '#C9A96E' : '#4B5563', marginTop: 5, textAlign: 'center', fontWeight: p.n === 1 ? 600 : 400 }}>{p.label}</div>
                </div>
                {i < PHASES.length - 1 && (
                  <div style={{ height: 1, flex: 0.3, background: 'rgba(201,169,110,0.15)', marginBottom: 14 }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#4B5563', textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
          You&rsquo;ll start at Phase 1. Your trainer will advance you as you hit milestones.
        </div>

        <button
          onClick={() => setStep('password')}
          style={{
            width: '100%', background: '#C9A96E',
            color: '#142D48', border: 'none', borderRadius: 4,
            padding: '13px', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Set My Password →
        </button>
      </div>
    )
  }

  // ── Step 2: Set password ──────────────────────────────────────────────────
  return (
    <div>
      {/* Back + heading */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => setStep('welcome')}
          style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 16 }}
        >
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 300, color: '#ffffff', marginBottom: 6 }}>
          Create Your Password
        </div>
        <p style={{ fontSize: 12, color: '#6B8299', margin: 0, lineHeight: 1.5 }}>
          Choose something secure. You&rsquo;ll use this with your email to log in.
        </p>
      </div>

      {/* Requirements hint */}
      <div style={{
        background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.1)',
        borderRadius: 4, padding: '10px 14px', marginBottom: 20,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <span style={{ color: '#C9A96E', fontSize: 13, lineHeight: 1 }}>ℹ</span>
        <span style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
          Must be at least 8 characters. Use a mix of letters, numbers, and symbols for best security.
        </span>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              required minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              style={{ ...inputStyle, paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6B8299', cursor: 'pointer', fontSize: 11 }}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          {/* Strength bar */}
          {password.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
              {[4, 7, 11].map((threshold, i) => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: password.length > threshold
                    ? (i === 0 ? '#f87171' : i === 1 ? '#f59e0b' : '#4ade80')
                    : 'rgba(255,255,255,0.06)',
                  transition: 'background 0.2s',
                }} />
              ))}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Confirm Password</label>
          <input
            type={showPw ? 'text' : 'password'}
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            style={{
              ...inputStyle,
              border: confirm.length > 0 && confirm !== password
                ? '1px solid rgba(248,113,113,0.5)'
                : inputStyle.border,
            }}
          />
          {confirm.length > 0 && confirm === password && (
            <div style={{ fontSize: 11, color: '#4ade80', marginTop: 5 }}>✓ Passwords match</div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.15)' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || password !== confirm || password.length < 8}
          style={{
            marginTop: 4, width: '100%',
            background: loading || password !== confirm || password.length < 8 ? 'rgba(201,169,110,0.3)' : '#C9A96E',
            color: '#142D48', border: 'none', borderRadius: 4,
            padding: '13px', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            cursor: loading || password !== confirm || password.length < 8 ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {loading ? 'Activating your account...' : 'Activate My Account'}
        </button>
      </form>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(201,169,110,0.4)' }} />
          <span style={{ fontSize: 10, color: 'rgba(201,169,110,0.4)' }}>Review Portal</span>
        </div>
        <div style={{ width: 20, height: 1, background: 'rgba(201,169,110,0.2)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A96E' }} />
          <span style={{ fontSize: 10, color: '#C9A96E' }}>Set Password</span>
        </div>
      </div>
    </div>
  )
}

export default function InvitePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0A1628' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#132238', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 8, padding: '36px 36px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
            All Financial Freedom
          </div>
          <div style={{ width: 32, height: 1, background: 'rgba(201,169,110,0.3)', margin: '12px auto 0' }} />
        </div>
        <Suspense fallback={<div style={{ color: '#6B8299', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Loading...</div>}>
          <InviteForm />
        </Suspense>
      </div>
    </div>
  )
}
