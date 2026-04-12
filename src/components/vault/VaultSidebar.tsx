'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const NAV = [
  { href: '/vault', label: 'Dashboard', icon: '◈' },
  { href: '/vault/import', label: 'Import', icon: '↑' },
  { href: '/vault/outreach', label: 'Outreach', icon: '✉' },
  { href: '/vault/pipeline', label: 'Pipeline', icon: '◫' },
  { href: '/vault/sequence', label: 'Sequences', icon: '⟳' },
  { href: '/vault/contacts', label: 'Contacts', icon: '◉' },
  { href: '/vault/settings', label: 'Settings', icon: '⚙' },
]

export default function VaultSidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 220, background: '#142D48', display: 'flex', flexDirection: 'column',
      padding: '32px 0', flexShrink: 0, borderRight: '1px solid rgba(201,169,110,0.1)',
    }}>
      {/* Brand */}
      <div style={{ padding: '0 24px 28px', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>
        <p style={{ color: '#C9A96E', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 4px' }}>
          All Financial Freedom
        </p>
        <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 300, margin: 0 }}>Vault</p>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '20px 12px' }}>
        {NAV.map(item => {
          const active = pathname === item.href || (item.href !== '/vault' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 4, marginBottom: 2,
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

      {/* Sign out */}
      <div style={{ padding: '0 12px' }}>
        <button
          onClick={() => signOut({ callbackUrl: '/vault/login' })}
          style={{
            width: '100%', padding: '9px 12px', background: 'transparent',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: 10, borderRadius: 4,
          }}
        >
          <span style={{ color: 'rgba(201,169,110,0.3)', fontSize: 14, width: 18, textAlign: 'center' }}>⏻</span>
          <span style={{ color: '#6B8299', fontSize: 13 }}>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
