'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Known categories with curated icons + labels. Anything else from
// the admin /vault/setup page that isn't in this map still renders,
// in its own section, with a default icon — so a new category
// added in vault auto-appears on the agent side without a code
// change.
const RESOURCE_GROUPS: { key: string; label: string; icon: string }[] = [
  { key: 'videos',    label: 'Videos',    icon: '▶' },
  { key: 'books',     label: 'Books',     icon: '◈' },
  { key: 'training',  label: 'Training',  icon: '◐' },
  { key: 'scripts',   label: 'Scripts',   icon: '✎' },
  { key: 'tools',     label: 'Tools',     icon: '⚙' },
  { key: 'forms',     label: 'Forms',     icon: '◫' },
  { key: 'general',   label: 'General',   icon: '↗' },
]

const DEFAULT_GROUP_META = { icon: '↗', labelFromKey: (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

interface Resource { key: string; label: string; url: string; category: string }

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agents/setup-resources?full=1')
      .then(r => r.json())
      .then((d: { resources: Resource[] | Record<string, string> }) => {
        if (Array.isArray(d.resources)) setResources(d.resources)
        else setResources(Object.entries(d.resources).map(([key, url]) => ({
          key, url, label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), category: 'general',
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Build groups in the curated order first, then append any unknown
  // categories the admin created in vault that aren't in
  // RESOURCE_GROUPS so they still surface (just without a hand-tuned
  // icon).
  const knownKeys = new Set(RESOURCE_GROUPS.map(g => g.key))
  const grouped = [
    ...RESOURCE_GROUPS.map(g => ({ ...g, items: resources.filter(r => r.category === g.key) })),
    ...Array.from(new Set(resources.map(r => r.category)))
      .filter(c => c && !knownKeys.has(c))
      .map(c => ({
        key: c,
        label: DEFAULT_GROUP_META.labelFromKey(c),
        icon: DEFAULT_GROUP_META.icon,
        items: resources.filter(r => r.category === c),
      })),
  ].filter(g => g.items.length > 0)

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
          <span style={{ marginLeft: 12, fontSize: 11, color: '#4B5563' }}>Resources</span>
        </div>
        <Link
          href="/agents"
          style={{ color: '#9BB0C4', fontSize: 12, textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}
        >
          ← Back to portal
        </Link>
      </div>

      <div style={{ padding: 'clamp(20px, 4vw, 36px) clamp(16px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 'clamp(22px, 4.5vw, 32px)', fontWeight: 300, margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em' }}>
            Resources
          </h1>
          <p style={{ fontSize: 13, color: '#6B8299', marginTop: 6 }}>
            Training videos, books, tools, and links curated by the leadership team.
          </p>
        </div>

        {loading ? (
          <div style={{ color: '#6B8299', fontSize: 13 }}>Loading resources...</div>
        ) : grouped.length === 0 ? (
          <div style={{ color: '#4B5563', fontSize: 13 }}>No resources available yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {grouped.map(g => (
              <div key={g.key} style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 14, color: '#C9A96E' }}>{g.icon}</span>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
                    {g.label}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 8 }}>
                  {g.items.map(r => (
                    <a
                      key={r.key}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', borderRadius: 6,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        textDecoration: 'none', color: 'inherit',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                        background: g.key === 'videos' ? 'rgba(239,68,68,0.1)' : g.key === 'books' ? 'rgba(201,169,110,0.1)' : 'rgba(96,165,250,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, color: g.key === 'videos' ? '#ef4444' : g.key === 'books' ? '#C9A96E' : '#60a5fa',
                      }}>
                        {g.key === 'videos' ? '▶' : g.key === 'books' ? '◈' : '↗'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.label}
                        </div>
                        <div style={{ fontSize: 10, color: '#4B5563', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.url.replace(/^https?:\/\//, '').split('/')[0]}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
