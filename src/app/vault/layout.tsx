import type { ReactNode } from 'react'
import VaultSidebar from '@/components/vault/VaultSidebar'

export const metadata = { title: 'Vault — AFF' }

export default function VaultLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0C1E30' }}>
      <VaultSidebar />
      <main style={{ flex: 1, padding: '40px 48px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
