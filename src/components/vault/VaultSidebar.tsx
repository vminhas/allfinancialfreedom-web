'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface NavItem { href: string; label: string; icon: string }
interface NavGroup { key: string; label: string; items: NavItem[]; defaultOpen?: boolean }

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview', label: '', defaultOpen: true,
    items: [{ href: '/vault', label: 'Dashboard', icon: '◈' }],
  },
  {
    key: 'crm', label: 'CRM', defaultOpen: false,
    items: [
      { href: '/vault/import', label: 'Import', icon: '↑' },
      { href: '/vault/outreach', label: 'Outreach', icon: '✉' },
      { href: '/vault/pipeline', label: 'Pipeline', icon: '◫' },
      { href: '/vault/sequence', label: 'Sequences', icon: '⟳' },
      { href: '/vault/contacts', label: 'Contacts', icon: '◉' },
    ],
  },
  {
    key: 'agents', label: 'Agents', defaultOpen: true,
    items: [
      { href: '/vault/tracker', label: 'AFF Tracker', icon: '◑' },
      { href: '/vault/licensing', label: 'Licensing Inbox', icon: '◎' },
      { href: '/vault/trainings', label: 'Trainings', icon: '▶' },
      { href: '/vault/call-review', label: 'Call Review', icon: '◐' },
      { href: '/vault/birthdays', label: 'Birthdays', icon: '✦' },
      { href: '/vault/feedback', label: 'Feedback', icon: '✉' },
    ],
  },
  {
    key: 'system', label: 'System', defaultOpen: true,
    items: [
      { href: '/vault/setup', label: 'Setup', icon: '⊞' },
      { href: '/vault/guide', label: 'Guide', icon: '?' },
      { href: '/vault/settings', label: 'Settings', icon: '⚙' },
    ],
  },
]

const NAV_LC_GROUPS: NavGroup[] = [
  {
    key: 'main', label: '', defaultOpen: true,
    items: [
      { href: '/vault/licensing', label: 'Licensing Inbox', icon: '◎' },
      { href: '/vault/setup', label: 'Setup', icon: '⊞' },
      { href: '/vault/guide', label: 'Guide', icon: '?' },
    ],
  },
]

export default function VaultSidebar() {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isLC = role === 'licensing_coordinator'
  const groups = isLC ? NAV_LC_GROUPS : NAV_GROUPS
  const brandSubtitle = isLC ? 'Licensing' : 'Vault'
  const userName = (session?.user as { name?: string } | undefined)?.name

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const collapsed = new Set<string>()
    groups.forEach(g => { if (!g.defaultOpen && g.label) collapsed.add(g.key) })
    return collapsed
  })

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  // Auto-expand group if current page is in it
  useEffect(() => {
    for (const g of groups) {
      if (g.items.some(item => pathname === item.href || (item.href !== '/vault' && pathname.startsWith(item.href)))) {
        setCollapsedGroups(prev => {
          if (prev.has(g.key)) {
            const next = new Set(prev)
            next.delete(g.key)
            return next
          }
          return prev
        })
      }
    }
  }, [pathname, groups])

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const brand = (
    <div style={{ padding: '0 24px 18px', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>
      <p style={{ color: '#C9A96E', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 4px' }}>
        All Financial Freedom
      </p>
      <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 300, margin: '0 0 10px' }}>{brandSubtitle}</p>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 999,
        background: isLC ? 'rgba(155,109,255,0.12)' : 'rgba(201,169,110,0.12)',
        border: `1px solid ${isLC ? 'rgba(155,109,255,0.35)' : 'rgba(201,169,110,0.35)'}`,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLC ? '#9B6DFF' : '#C9A96E' }} />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: isLC ? '#9B6DFF' : '#C9A96E',
        }}>
          {isLC ? 'Licensing Coordinator' : 'Admin'}
        </span>
      </div>
      {userName && <p style={{ fontSize: 11, color: '#9BB0C4', margin: '8px 0 0' }}>{userName}</p>}
    </div>
  )

  const renderNavItem = (item: NavItem) => {
    const active = pathname === item.href || (item.href !== '/vault' && pathname.startsWith(item.href))
    return (
      <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 4, marginBottom: 1,
          background: active ? 'rgba(201,169,110,0.12)' : 'transparent',
          cursor: 'pointer', transition: 'background 0.15s',
        }}>
          <span style={{ color: active ? '#C9A96E' : 'rgba(201,169,110,0.35)', fontSize: 13, width: 18, textAlign: 'center' }}>
            {item.icon}
          </span>
          <span style={{ color: active ? '#ffffff' : '#6B8299', fontSize: 12, fontWeight: active ? 500 : 400 }}>
            {item.label}
          </span>
        </div>
      </Link>
    )
  }

  const navList = (
    <nav style={{ flex: 1, padding: '14px 12px', overflowY: 'auto' }}>
      {groups.map(group => {
        const isCollapsed = collapsedGroups.has(group.key)
        const hasActiveItem = group.items.some(item =>
          pathname === item.href || (item.href !== '/vault' && pathname.startsWith(item.href))
        )

        return (
          <div key={group.key} style={{ marginBottom: group.label ? 6 : 2 }}>
            {group.label && (
              <button
                onClick={() => toggleGroup(group.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '6px 12px', marginBottom: 2,
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: hasActiveItem ? '#C9A96E' : '#4B5563',
                }}>
                  {group.label}
                </span>
                <span style={{
                  fontSize: 10, color: '#4B5563',
                  transition: 'transform 0.2s',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                }}>
                  ▾
                </span>
              </button>
            )}
            {!isCollapsed && group.items.map(renderNavItem)}
          </div>
        )
      })}
    </nav>
  )

  const signOutBtn = (
    <div style={{ padding: '0 12px 16px' }}>
      <button
        onClick={() => signOut({ callbackUrl: '/vault/login' })}
        style={{
          width: '100%', padding: '8px 12px', background: 'transparent',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: 10, borderRadius: 4,
        }}
      >
        <span style={{ color: 'rgba(201,169,110,0.3)', fontSize: 13, width: 18, textAlign: 'center' }}>⏻</span>
        <span style={{ color: '#6B8299', fontSize: 12 }}>Sign Out</span>
      </button>
    </div>
  )

  if (isMobile) {
    return (
      <>
        <header style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: '#142D48', borderBottom: '1px solid rgba(201,169,110,0.1)',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            style={{
              background: 'transparent', border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 4, padding: '6px 10px', cursor: 'pointer',
              color: '#C9A96E', fontSize: 16, lineHeight: 1,
            }}
          >
            ☰
          </button>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#C9A96E', fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
              All Financial Freedom
            </p>
            <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 300, margin: 0 }}>Vault</p>
          </div>
        </header>

        {open && (
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.65)', zIndex: 45,
              backdropFilter: 'blur(2px)',
            }}
          />
        )}

        <aside
          aria-hidden={!open}
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            width: 260, maxWidth: '85vw',
            background: '#142D48',
            borderRight: '1px solid rgba(201,169,110,0.1)',
            transform: open ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            zIndex: 50,
            display: 'flex', flexDirection: 'column',
            padding: '24px 0 0',
            boxShadow: open ? '0 12px 48px rgba(0,0,0,0.5)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 24px', marginBottom: 4 }}>
            <div>
              <p style={{ color: '#C9A96E', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 4px' }}>
                All Financial Freedom
              </p>
              <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 300, margin: 0 }}>Vault</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#9BB0C4', fontSize: 20, padding: 4, marginTop: -4,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(201,169,110,0.12)' }} />
          {navList}
          {signOutBtn}
        </aside>
      </>
    )
  }

  return (
    <aside style={{
      width: 220, background: '#142D48', display: 'flex', flexDirection: 'column',
      padding: '32px 0', flexShrink: 0, borderRight: '1px solid rgba(201,169,110,0.1)',
    }}>
      {brand}
      {navList}
      {signOutBtn}
    </aside>
  )
}
