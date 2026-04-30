'use client'

// Status landing page after the agent clicks the verify link from
// their new email. The /api/agents/profile/email-verify route does
// the actual swap then redirects here with ?status=ok | invalid |
// expired | collision | missing.

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const COPY: Record<string, { title: string; body: string; color: string }> = {
  ok: {
    title: 'Email confirmed',
    body: "You're all set. Sign in with your new email going forward; your old address won't work for the AFF agent portal anymore.",
    color: '#4ADE80',
  },
  invalid: {
    title: 'This link is no longer valid',
    body: 'It may have already been used or cancelled. If you still need to change your email, request a new verification from your profile.',
    color: '#F59E0B',
  },
  expired: {
    title: 'This link expired',
    body: 'Verification links are good for 24 hours. Head back to your profile and request a new one.',
    color: '#F59E0B',
  },
  collision: {
    title: "That email isn't available",
    body: 'Someone else claimed that email between when you requested the change and now. Pick a different address from your profile and try again.',
    color: '#F87171',
  },
  missing: {
    title: 'Missing token',
    body: 'The verification link looks malformed. Check that you pasted the full URL from the email.',
    color: '#F87171',
  },
}

export default function EmailVerifyPage() {
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
