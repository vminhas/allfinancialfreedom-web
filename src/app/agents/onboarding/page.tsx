'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

export default function OnboardingPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  const [step, setStep] = useState<'intro' | 'profile'>('intro')
  const [agentName, setAgentName] = useState('')
  const [form, setForm] = useState({ phone: '', state: '', dateOfBirth: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profileLoaded, setProfileLoaded] = useState(false)

  // If not logged in, redirect to login
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/agents/login')
    }
  }, [status, router])

  // Load existing profile data
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/agents/me')
      .then(r => r.json())
      .then((d: { firstName?: string; lastName?: string; phone?: string; state?: string; dateOfBirth?: string }) => {
        if (d.firstName) setAgentName(`${d.firstName} ${d.lastName ?? ''}`.trim())
        // Pre-fill any existing data
        setForm({
          phone: d.phone ?? '',
          state: d.state ?? '',
          dateOfBirth: d.dateOfBirth ? d.dateOfBirth.split('T')[0] : '',
        })
        setProfileLoaded(true)
      })
      .catch(() => setProfileLoaded(true))
  }, [status])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.phone) { setError('Phone number is required'); return }
    if (!form.state) { setError('State is required'); return }
    setLoading(true)
    setError('')

    const res = await fetch('/api/agents/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      setError(d.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    router.push('/agents')
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
    display: 'block', fontSize: 10, fontWeight: 700 as const,
    letterSpacing: '0.15em', textTransform: 'uppercase' as const,
    color: '#C9A96E', marginBottom: 6,
  }

  if (status === 'loading' || !profileLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A1628' }}>
        <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0A1628' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#132238', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 8, padding: '36px 36px 32px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
            All Financial Freedom
          </div>
          <div style={{ width: 32, height: 1, background: 'rgba(201,169,110,0.3)', margin: '12px auto 0' }} />
        </div>

        {step === 'intro' ? (
          /* ── Intro step ─────────────────────────────────────────────── */
          <div>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 22, fontWeight: 300, color: '#ffffff', marginBottom: 8 }}>
                {agentName ? `Welcome, ${agentName.split(' ')[0]}!` : 'Welcome!'}
              </div>
              <p style={{ fontSize: 13, color: '#6B8299', margin: 0, lineHeight: 1.6 }}>
                Let&rsquo;s take one minute to set up your profile before you dive in.
              </p>
            </div>

            {/* What we'll collect */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>
                What we need
              </div>
              {[
                { icon: '◉', title: 'Phone Number', desc: 'So your trainer and teammates can reach you.' },
                { icon: '◎', title: 'Your State', desc: 'Ensures you see the right licensing and carrier info for your market.' },
                { icon: '◈', title: 'Date of Birth', desc: 'Optional — helps with certain carrier appointment requirements.' },
              ].map(item => (
                <div key={item.icon} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 14px', marginBottom: 8,
                  background: 'rgba(201,169,110,0.04)',
                  border: '1px solid rgba(201,169,110,0.08)',
                  borderRadius: 6,
                }}>
                  <span style={{ color: '#C9A96E', fontSize: 16, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ color: '#ffffff', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{item.title}</div>
                    <div style={{ color: '#6B8299', fontSize: 11, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep('profile')}
              style={{
                width: '100%', background: '#C9A96E',
                color: '#142D48', border: 'none', borderRadius: 4,
                padding: '13px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Complete My Profile →
            </button>

            <button
              onClick={() => router.push('/agents')}
              style={{
                display: 'block', width: '100%', marginTop: 10,
                background: 'transparent', border: 'none',
                color: '#4B5563', fontSize: 11, cursor: 'pointer',
                padding: '8px',
              }}
            >
              Skip for now
            </button>
          </div>
        ) : (
          /* ── Profile form step ──────────────────────────────────────── */
          <div>
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={() => setStep('intro')}
                style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 16 }}
              >
                ← Back
              </button>
              <div style={{ fontSize: 16, fontWeight: 300, color: '#ffffff', marginBottom: 6 }}>
                Complete Your Profile
              </div>
              <p style={{ fontSize: 12, color: '#6B8299', margin: 0, lineHeight: 1.5 }}>
                You can update this anytime from your Profile tab.
              </p>
            </div>

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(555) 555-5555"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>State *</label>
                <select
                  required
                  value={form.state}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'auto' }}
                >
                  <option value="">Select your state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Date of Birth <span style={{ color: '#4B5563', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  style={inputStyle}
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
                  marginTop: 4, width: '100%',
                  background: loading ? 'rgba(201,169,110,0.3)' : '#C9A96E',
                  color: '#142D48', border: 'none', borderRadius: 4,
                  padding: '13px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {loading ? 'Saving...' : 'Enter My Portal →'}
              </button>
            </form>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              {[
                { label: 'Set Password', done: true },
                { label: 'Profile', done: false },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: i > 0 ? 8 : 0 }}>
                  {i > 0 && <div style={{ width: 20, height: 1, background: 'rgba(201,169,110,0.2)' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.done ? 'rgba(201,169,110,0.4)' : '#C9A96E' }} />
                    <span style={{ fontSize: 10, color: s.done ? 'rgba(201,169,110,0.4)' : '#C9A96E' }}>{s.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
