import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import VaultSidebar from '@/components/vault/VaultSidebar'
import VaultSessionProvider from './VaultSessionProvider'

export const metadata = { title: 'Vault — AFF' }

// Paths a Licensing Coordinator is allowed to visit. Everything else redirects
// back to /vault/licensing. Admins can visit anything.
// LC profile + password change live inside /vault/licensing as a tab — they
// are NOT allowed into /vault/settings (which exposes admin API keys, GHL
// config, etc.).
const LC_ALLOWED_PREFIXES = ['/vault/licensing', '/vault/setup']

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
        <VaultSidebar />
        <main className="vault-main">
          {children}
        </main>
      </div>
    </VaultSessionProvider>
  )
}
