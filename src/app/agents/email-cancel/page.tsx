'use client'

// Status landing page after the agent clicks the cancel link from the
// security alert email. /api/agents/profile/email-change-cancel
// clears the pending fields then redirects here.

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const COPY: Record<string, { title: string; body: string; color: string }> = {
  ok: {
    title: 'Email change cancelled',
    body: "We've cancelled the pending email change on your account. If you didn't request it in the first place, change your password right away and email operations@allfinancialfreedom.com so we can investigate.",
    color: '#4ADE80',
  },
  invalid: {
    title: "Nothing to cancel",
    body: "There's no pending email change on this account, or the link has already been used.",
    color: '#F59E0B',
  },
  missing: {
    title: 'Missing token',
    body: 'The cancel link looks malformed. Check that you pasted the full URL from the alert email.',
    color: '#F87171',
  },
}

export default function EmailCancelPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const searchParams = useSearchParams()
  const status = searchParams.get('status') ?? 'invalid'
  const c = COPY[status] ?? COPY.invalid
  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#0F1E33', border: `1px solid ${c.color}40`, borderRadius: 10, padding: 36 }}>
        <div style={{ fontSize: 11, color: c.color, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>
          Email change
        </div>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 600, margin: '0 0 12px', lineHeight: 1.3 }}>
          {c.title}
        </h1>
        <p style={{ color: '#9BB0C4', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          {c.body}
        </p>
        <Link
          href="/agents"
          style={{
            display: 'inline-block', padding: '12px 24px',
            background: '#C9A96E', color: '#142D48',
            borderRadius: 4, fontSize: 12, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
