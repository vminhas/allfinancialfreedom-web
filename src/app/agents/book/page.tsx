'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Mirror of the discord #trainer-booking channel: agents land here
// to grab a Calendly link to leadership, their CFT, or licensing
// support without having to chase someone in DMs.

interface BookingLink {
  id: string
  name: string
  role: string
  group: 'leadership' | 'trainers' | 'support'
  calendlyUrl: string
  description?: string
  icon?: string
}

const GROUP_LABEL: Record<BookingLink['group'], string> = {
  leadership: 'Leadership',
  trainers: 'Trainers',
  support: 'Licensing & Support',
}

const GROUP_ICON: Record<BookingLink['group'], string> = {
  leadership: '⚜',
  trainers: '◆',
  support: '✉',
}

const GROUP_COLOR: Record<BookingLink['group'], string> = {
  leadership: '#C9A96E',
  trainers: '#9B6DFF',
  support: '#60A5FA',
}

export default function BookPage() {
  const [links, setLinks] = useState<BookingLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agents/booking-links')
      .then(r => r.ok ? r.json() : { links: [] })
      .then((d: { links: BookingLink[] }) => setLinks(d.links ?? []))
      .catch(() => setLinks([]))
      .finally(() => setLoading(false))
  }, [])

  // Bucket entries by group, preserving the curated order admins set
  // in vault settings (Promise.all on the cleaned save preserves array
  // order, so we just filter per group here).
  const byGroup = (g: BookingLink['group']) => links.filter(l => l.group === g)

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#fff' }}>
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: '14px clamp(16px, 4vw, 32px)',
        paddingTop: 'calc(14px + env(safe-area-inset-top))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10,
        background: '#0A1628',
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </span>
          <span style={{ marginLeft: 12, fontSize: 11, color: '#4B5563' }}>Book a Time</span>
        </div>
        <Link
          href="/agents"
          style={{ background: 'transparent', color: '#9BB0C4', fontSize: 12, textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}
        >
          ← Back to portal
        </Link>
      </div>

      <div style={{ padding: 'clamp(20px, 4vw, 36px) clamp(16px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 'clamp(22px, 4.5vw, 32px)', fontWeight: 300, margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em' }}>
            Book a Time
          </h1>
          <p style={{ fontSize: 13, color: '#6B8299', marginTop: 6, lineHeight: 1.55, maxWidth: 640 }}>
            Schedule directly with leadership, your trainer, or the licensing team. Tap any name to open their calendar.
          </p>
        </div>

        {loading ? (
          <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
        ) : links.length === 0 ? (
          <div style={{ color: '#6B8299', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
            No booking links published yet. Your admin can add them in vault settings.
          </div>
        ) : (
          (['leadership', 'trainers', 'support'] as const).map(group => {
            const groupLinks = byGroup(group)
            if (groupLinks.length === 0) return null
            const accent = GROUP_COLOR[group]
            return (
              <section key={group} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18, color: accent }}>{GROUP_ICON[group]}</span>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent }}>
                    {GROUP_LABEL[group]}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                  {groupLinks.map(link => (
                    <BookingCard key={link.id} link={link} accent={accent} />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

function BookingCard({ link, accent }: { link: BookingLink; accent: string }) {
  const initials = link.name.split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase()
  // The icon field is intentionally permissive: admins can drop any
  // emoji ("✦", "🎯") and we render it. Falls back to initials.
  const showIcon = link.icon && link.icon.trim().length > 0
  return (
    <a
      href={link.calendlyUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '16px 18px',
        background: '#132238',
        border: `1px solid ${accent}33`,
        borderRadius: 8,
        textDecoration: 'none', color: 'inherit',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: `${accent}1a`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: showIcon ? 20 : 13, fontWeight: 700,
          flexShrink: 0, border: `1px solid ${accent}40`,
        }}>
          {showIcon ? link.icon : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
            {link.name}
          </div>
          {link.role && (
            <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 2 }}>
              {link.role}
            </div>
          )}
        </div>
      </div>
      {link.description && (
        <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
          {link.description}
        </div>
      )}
      <div style={{
        marginTop: 'auto', alignSelf: 'flex-start',
        background: accent, color: '#0A1628',
        padding: '6px 12px', borderRadius: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        Book a time →
      </div>
    </a>
  )
}
