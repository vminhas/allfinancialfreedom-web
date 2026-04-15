import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import VaultSidebar from '@/components/vault/VaultSidebar'

export const metadata = { title: 'Vault — AFF' }

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const isLoginPage = pathname === '/vault/login'

  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = session && role === 'admin'

  // On the login page: redirect admins straight to /vault, show bare page for everyone else
  if (isLoginPage) {
    if (isAdmin) redirect('/vault')
    return <>{children}</>
  }

  // All other vault pages: require admin session (middleware already enforces this,
  // but be defensive in case of a race or direct server render)
  if (!isAdmin) {
    return <>{children}</>
  }

  return (
    <div className="vault-shell">
      <VaultSidebar />
      <main className="vault-main">
        {children}
      </main>
    </div>
  )
}
