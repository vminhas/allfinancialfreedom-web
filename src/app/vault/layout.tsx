import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import VaultSidebar from '@/components/vault/VaultSidebar'
import VaultSessionProvider from './VaultSessionProvider'
import PullToRefresh from '@/components/PullToRefresh'
import { LC_ALLOWED_PREFIXES } from '@/lib/permissions'

export const metadata: Metadata = {
  title: 'Vault — AFF',
  appleWebApp: {
    capable: true,
    title: 'AFF Vault',
    statusBarStyle: 'black-translucent',
  },
  // See agents/layout.tsx for the rationale — explicit icon link plus a
  // ?v=2 cache-buster so iOS picks up the new phoenix instead of its
  // first-letter fallback.
  icons: {
    apple: [
      { url: '/vault/apple-icon?v=2', sizes: '180x180', type: 'image/png' },
    ],
    icon: [
      { url: '/vault/apple-icon?v=2', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#0A1628',
}

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const isLoginPage = pathname === '/vault/login'

  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = !!session && role === 'admin'
  const isLc = !!session && role === 'licensing_coordinator'
  const isStaff = isAdmin || isLc

  // On the login page: redirect logged-in users to their home, show bare page for everyone else
  if (isLoginPage) {
    if (isAdmin) redirect('/vault')
    if (isLc) redirect('/vault/licensing')
    return <>{children}</>
  }

  // All other vault pages: require a staff session
  if (!isStaff) {
    return <>{children}</>
  }

  // Licensing Coordinator: restrict to their allowed pages
  if (isLc && pathname && !LC_ALLOWED_PREFIXES.some(p => pathname.startsWith(p))) {
    redirect('/vault/licensing')
  }

  return (
    <VaultSessionProvider>
      <div className="vault-shell">
        <PullToRefresh />
        <VaultSidebar />
        <main className="vault-main">
          {children}
        </main>
      </div>
    </VaultSessionProvider>
  )
}
