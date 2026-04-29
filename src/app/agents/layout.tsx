import type { Metadata, Viewport } from 'next'
import AgentSessionProvider from './AgentSessionProvider'
import PullToRefresh from '@/components/PullToRefresh'

export const metadata: Metadata = {
  title: 'Agent Portal — All Financial Freedom',
  description: 'Your personal Agent Progression Tracker',
  // Tell iOS this app is installable and behaves like a standalone app
  // when launched from the home screen via "Add to Home Screen".
  appleWebApp: {
    capable: true,
    title: 'AFF Agent',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A1628',
}

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentSessionProvider>
      <PullToRefresh />
      {children}
    </AgentSessionProvider>
  )
}
