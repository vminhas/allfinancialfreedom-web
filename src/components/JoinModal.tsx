'use client'

import { useState, useEffect } from 'react'

function ApplicationForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', licensed: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { onSuccess() } else { setStatus('error') }
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.7rem 1rem', fontSize: '0.875rem',
    border: '1px solid rgba(201,169,110,0.2)', borderRadius: 3,
    color: '#ffffff', background: 'rgba(255,255,255,0.06)',
    outline: 'none', fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.65rem', letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'rgba(201,169,110,0.8)',
    marginBottom: '0.4rem', fontWeight: 500,
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>First Name *</label>
          <input required style={inputStyle} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="First name" />
        </div>
        <div>
          <label style={labelStyle}>Last Name *</label>
          <input required style={inputStyle} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Last name" />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Email *</label>
        <input required type="email" style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} placeholder="your@email.com" />
      </div>
      <div>
        <label style={labelStyle}>Are you currently licensed?</label>
        <select style={{ ...inputStyle, color: form.licensed ? '#ffffff' : 'rgba(255,255,255,0.4)' }} value={form.licensed} onChange={e => set('licensed', e.target.value)}>
          <option value="">Select one</option>
          <option value="yes">Yes, I am licensed</option>
          <option value="in-progress">In progress</option>
          <option value="no">Not yet</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Why do you want to join All Financial Freedom?</label>
        <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={form.message} onChange={e => set('message', e.target.value)} placeholder="Tell us what drives you..." />
      </div>
      {status === 'error' && (
        <p style={{ color: '#e57373', fontSize: '0.8rem' }}>Something went wrong. Please email contact@allfinancialfreedom.com</p>
      )}
      <button type="submit" disabled={status === 'sending'} className="btn-gold"
        style={{ opacity: status === 'sending' ? 0.7 : 1, width: '100%', justifyContent: 'center' }}>
        {status === 'sending' ? 'Submitting...' : 'Submit Application'}
      </button>
      <p style={{ fontSize: '0.65rem', color: 'rgba(235,244,255,0.3)', textAlign: 'center' }}>
        We review every application personally and respond within 24-48 hours.
      </p>
    </form>
  )
}

export default function JoinModal() {
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const handler = () => { setOpen(true); setSubmitted(false) }
    window.addEventListener('open-join', handler)
    return () => window.removeEventListener('open-join', handler)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) {
      document.addEventListener('keydown', handleKey)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        className="relative w-[90%] max-w-xl rounded-sm flex flex-col"
        style={{
          background: '#161616',
          border: '1px solid rgba(201,169,110,0.2)',
          maxHeight: '90vh',
        }}
      >
        {/* Header — always visible */}
        <div className="flex items-center justify-between px-8 py-6 shrink-0 rounded-t-sm"
          style={{ background: '#161616', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
          <div>
            <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '4px' }}>
              All Financial Freedom
            </p>
            <h3 className="font-serif font-light text-2xl" style={{ color: '#ffffff' }}>
              {submitted ? 'Application Received.' : 'Join Our Team.'}
            </h3>
          </div>
          <button onClick={() => setOpen(false)}
            className="text-2xl leading-none transition-colors px-2"
            style={{ color: 'rgba(235,244,255,0.4)' }}
            aria-label="Close">
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-8">
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#C9A96E' }}>✓</div>
              <h4 className="font-serif text-xl mb-3" style={{ color: '#ffffff' }}>You are on your way.</h4>
              <p style={{ color: 'rgba(235,244,255,0.55)', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                We review every application personally. Expect to hear from us within 24-48 hours to schedule your discovery call.
              </p>
              <div style={{
                background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)',
                borderRadius: 4, padding: '1.2rem 1.4rem', marginBottom: '1.5rem', textAlign: 'left',
              }}>
                <p style={{ color: '#C9A96E', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>One more step</p>
                <p style={{ color: 'rgba(235,244,255,0.7)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
                  Share your phone number so we can reach you directly. Use the chat bubble in the bottom-right corner of this page to send it over.
                </p>
              </div>
              <button
                onClick={() => {
                  setOpen(false)
                  setTimeout(() => {
                    const btn = document.querySelector<HTMLElement>('[data-widget-id] button, .chat-widget-button, #chat-widget-minimized')
                    btn?.click()
                  }, 300)
                }}
                className="btn-gold"
                style={{ justifyContent: 'center', width: '100%', marginBottom: '0.75rem' }}
              >
                Open Chat
              </button>
              <button onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', color: 'rgba(235,244,255,0.3)',
                fontSize: '0.8rem', cursor: 'pointer', padding: '0.25rem',
              }}>
                Skip for now
              </button>
            </div>
          ) : (
            <ApplicationForm onSuccess={() => setSubmitted(true)} />
          )}
        </div>
      </div>
    </div>
  )
}
