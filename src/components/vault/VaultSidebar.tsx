'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

const NAV = [
  { href: '/vault', label: 'Dashboard', icon: '◈' },
  { href: '/vault/import', label: 'Import', icon: '↑' },
  { href: '/vault/outreach', label: 'Outreach', icon: '✉' },
  { href: '/vault/pipeline', label: 'Pipeline', icon: '◫' },
  { href: '/vault/sequence', label: 'Sequences', icon: '⟳' },
  { href: '/vault/contacts', label: 'Contacts', icon: '◉' },
  { href: '/vault/tracker', label: 'AFF Tracker', icon: '◑' },
  { href: '/vault/call-review', label: 'Call Review', icon: '◐' },
  { href: '/vault/settings', label: 'Settings', icon: '⚙' },
]

export default function VaultSidebar() {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  // Close drawer when navigating
  useEffect(() => { setOpen(false) }, [pathname])

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  const brand = (
    <div style={{ padding: '0 24px 24px', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>
      <p style={{ color: '#C9A96E', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 4px' }}>
        All Financial Freedom
      </p>
      <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 300, margin: 0 }}>Vault</p>
    </div>
  )

  const navList = (
    <nav style={{ flex: 1, padding: '20px 12px' }}>
      {NAV.map(item => {
        const active = pathname === item.href || (item.href !== '/vault' && pathname.startsWith(item.href))
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 4, marginBottom: 2,
              background: active ? 'rgba(201,169,110,0.12)' : 'transparent',
              cursor: 'pointer', transition: 'background 0.15s',
            }}>
              <span style={{ color: active ? '#C9A96E' : 'rgba(201,169,110,0.4)', fontSize: 14, width: 18, textAlign: 'center' }}>
                {item.icon}
              </span>
              <span style={{ color: active ? '#ffffff' : '#6B8299', fontSize: 13, fontWeight: active ? 500 : 400 }}>
                {item.label}
              </span>
            </div>
          </Link>
        )
      })}
    </nav>
  )

  const signOutBtn = (
    <div style={{ padding: '0 12px 16px' }}>
      <button
        onClick={() => signOut({ callbackUrl: '/vault/login' })}
        style={{
          width: '100%', padding: '10px 12px', background: 'transparent',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: 10, borderRadius: 4,
        }}
      >
        <span style={{ color: 'rgba(201,169,110,0.3)', fontSize: 14, width: 18, textAlign: 'center' }}>⏻</span>
        <span style={{ color: '#6B8299', fontSize: 13 }}>Sign Out</span>
      </button>
    </div>
  )

  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: '#142D48',
          borderBottom: '1px solid rgba(201,169,110,0.1)',
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

        {/* Backdrop */}
        {open && (
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              zIndex: 45,
              backdropFilter: 'blur(2px)',
            }}
          />
        )}

        {/* Slide-in drawer */}
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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 24px 0 24px', marginBottom: 4 }}>
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
          <div style={{ padding: '20px 24px 20px', borderBottom: '1px solid rgba(201,169,110,0.12)' }} />
          {navList}
          {signOutBtn}
        </aside>
      </>
    )
  }

  // Desktop sidebar
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
