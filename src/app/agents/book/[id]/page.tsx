'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

// Embedded booking page. Wraps the GHL booking widget in an iframe
// below an AFF header bar so the agent always has a clear "← Back"
// button. Fixes the mobile UX where a booking card opened a Calendly
// page in a new tab and there was no obvious way to navigate back.
//
// Fallback: GHL / the underlying provider can refuse to be iframed
// via X-Frame-Options or CSP. If the iframe doesn't fire onload
// within 5s we surface an explicit 'Open in new tab' link so the
// agent isn't stuck.

interface BookingLink {
  id: string
  name: string
  role: string
  group: 'leadership' | 'trainers' | 'support'
  calendlyUrl: string
  description?: string
  avatarUrl?: string
}

const GROUP_COLOR: Record<BookingLink['group'], string> = {
  leadership: '#C9A96E',
  trainers: '#9B6DFF',
  support: '#60A5FA',
}

export default function EmbeddedBookingPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [link, setLink] = useState<BookingLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [showFallback, setShowFallback] = useState(false)

  useEffect(() => {
    fetch('/api/agents/booking-links')
      .then(r => r.ok ? r.json() : { links: [] })
      .then((d: { links: BookingLink[] }) => {
        const match = (d.links ?? []).find(l => l.id === id)
        setLink(match ?? null)
      })
      .catch(() => setLink(null))
      .finally(() => setLoading(false))
  }, [id])

  // If the iframe doesn't load within 5s, the provider is probably
  // blocking embed. Show an explicit fallback link so the agent
  // can still book.
  useEffect(() => {
    if (!link || iframeLoaded) return
    const timer = setTimeout(() => setShowFallback(true), 5000)
    return () => clearTimeout(timer)
  }, [link, iframeLoaded])

  const accent = useMemo(() => link ? GROUP_COLOR[link.group] : '#C9A96E', [link])

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar with the back button. iOS safe-area inset on top
          so the back button doesn't slide under the status bar. */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.15)',
        padding: '12px clamp(14px, 4vw, 28px)',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <Link
          href="/agents/book"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: '#9BB0C4', fontSize: 13, textDecoration: 'none',
            padding: '6px 12px', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.1)',
            whiteSpace: 'nowrap',
          }}
        >← Back</Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: accent,
          }}>
            Book a Session
          </div>
          <div style={{
            fontSize: 14, fontWeight: 500, color: '#ffffff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {link ? `${link.name} · ${link.role}` : (loading ? 'Loading...' : 'Booking not found')}
          </div>
        </div>
        {link && (
          // 'Open in new tab' is always visible as an escape hatch in
          // case the iframe ever flakes mid-session. Subtle by default.
          <a
            href={link.calendlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in a new tab"
            style={{
              color: '#6B8299', fontSize: 11, textDecoration: 'none',
              padding: '6px 10px', borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.06)',
              whiteSpace: 'nowrap',
            }}
          >↗ New tab</a>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {!loading && !link && (
          <Centered>
            We couldn&apos;t find that booking link.
            <Link href="/agents/book" style={{ display: 'inline-block', marginTop: 12, color: '#C9A96E', fontSize: 13 }}>
              ← Back to all booking links
            </Link>
          </Centered>
        )}

        {link && !iframeLoaded && !showFallback && (
          <Centered>
            <span style={{ color: '#6B8299', fontSize: 13 }}>Loading the calendar...</span>
          </Centered>
        )}

        {link && showFallback && !iframeLoaded && (
          <Centered>
            <div style={{ color: '#9BB0C4', fontSize: 13, marginBottom: 14 }}>
              The calendar is taking a while to load. You can open it in a new tab instead.
            </div>
            <a
              href={link.calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                background: 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)',
                color: '#142D48', padding: '10px 22px', borderRadius: 5,
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', textDecoration: 'none',
              }}
            >Open booking page</a>
          </Centered>
        )}

        {link && (
          <iframe
            src={link.calendlyUrl}
            onLoad={() => setIframeLoaded(true)}
            title={`Book with ${link.name}`}
            // sandbox + allow are deliberately permissive: GHL booking
            // widgets need scripts, popups (for confirmation flows),
            // forms, and same-origin storage. Without these the widget
            // either fails to load or fails on submit.
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            allow="payment; clipboard-write"
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              background: '#ffffff',
              display: iframeLoaded ? 'block' : 'none',
              minHeight: 'calc(100vh - 80px)',
            }}
          />
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32, textAlign: 'center',
    }}>{children}</div>
  )
}
