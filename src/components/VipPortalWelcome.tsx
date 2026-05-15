'use client'

import { useEffect, useState } from 'react'

// One-time red-carpet greeting for a single distinguished guest. Shows
// once per browser (localStorage), only for the agent whose code matches
// the VIP Arrival setting. Self-fetches so it stays inert (renders null)
// for every other agent. Suppressed in admin "view as" preview so an
// admin poking around doesn't burn the one-time flag or see the modal.
//
// Deliberately self-contained and brand-light: no AFF stamp, no metrics,
// no faith. Just a warm, classy hello. No Discord tease here on purpose
// (the guest isn't a Discord user; dangling a surprise he can't reach
// would read as cheesy). The Discord card is the team-facing moment;
// this is his personal one.

const DISMISS_KEY = 'aff_vip_welcome_dismissed_v1'

export default function VipPortalWelcome({ previewToken }: { previewToken: string | null }) {
  const [info, setInfo] = useState<{ firstName: string; title: string } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (previewToken) return
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY)) return
    let cancelled = false
    fetch('/api/agents/vip-welcome')
      .then(r => r.json())
      .then((d: { show?: boolean; firstName?: string; title?: string }) => {
        if (cancelled || !d?.show) return
        setInfo({ firstName: d.firstName ?? 'there', title: d.title ?? '' })
        setOpen(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [previewToken])

  if (!open || !info) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setOpen(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(5,12,24,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
      onClick={dismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', maxWidth: 460, width: '100%',
          background: 'linear-gradient(180deg, #122036 0%, #0C1626 100%)',
          border: '1px solid rgba(201,168,76,0.45)',
          borderRadius: 14,
          boxShadow: '0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(201,168,76,0.10)',
          padding: '38px 34px 32px',
          textAlign: 'center',
        }}
      >
        <div style={{
          fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase',
          color: '#C9A84C', fontWeight: 700, marginBottom: 18,
        }}>
          ✦ &nbsp; W e l c o m e &nbsp; ✦
        </div>

        <h2 style={{
          margin: 0, fontSize: 26, fontWeight: 700, color: '#F4ECDA',
          letterSpacing: '0.01em',
        }}>
          We&apos;ve been hoping you&apos;d stop by, {info.firstName}.
        </h2>

        {info.title && (
          <div style={{
            marginTop: 8, fontSize: 13, color: '#C9A84C',
            letterSpacing: '0.06em', fontWeight: 600,
          }}>
            {info.title}
          </div>
        )}

        <p style={{
          marginTop: 18, marginBottom: 0, fontSize: 14.5, lineHeight: 1.7,
          color: '#A9BBD0',
        }}>
          Everything in here was built by hand, with care, for the people
          who trust us with their work. Take your time, open every door,
          and tell us what you think. The best seat in the house is yours.
        </p>

        <button
          onClick={dismiss}
          style={{
            marginTop: 26,
            background: 'linear-gradient(180deg, #D8B860 0%, #C9A84C 100%)',
            color: '#1A1306', border: 'none', borderRadius: 8,
            padding: '12px 30px', fontSize: 13, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(201,168,76,0.30)',
          }}
        >
          Step inside
        </button>
      </div>
    </div>
  )
}
