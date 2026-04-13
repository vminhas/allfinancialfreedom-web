import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agent Portal — All Financial Freedom',
  description: 'Your personal Agent Progression Tracker',
}

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A1628',
      color: '#ffffff',
      fontFamily: 'Inter, DM Sans, sans-serif',
    }}>
      {children}
    </div>
  )
}
