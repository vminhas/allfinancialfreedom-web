'use client'

import { SessionProvider } from 'next-auth/react'

export default function AgentSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div style={{
        minHeight: '100vh',
        background: '#0A1628',
        color: '#ffffff',
        fontFamily: 'Inter, DM Sans, sans-serif',
      }}>
        {children}
      </div>
    </SessionProvider>
  )
}
