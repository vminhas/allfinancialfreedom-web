import type { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import VaultSidebar from '@/components/vault/VaultSidebar'

export const metadata = { title: 'Vault — AFF' }

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)

  // Only show sidebar for authenticated admins
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || role !== 'admin') {
    return <>{children}</>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0C1E30' }}>
      <VaultSidebar />
      <main style={{ flex: 1, padding: '40px 48px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
