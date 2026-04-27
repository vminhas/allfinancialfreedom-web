import type { Metadata } from 'next'
import AgentSessionProvider from './AgentSessionProvider'

export const metadata: Metadata = {
  title: 'Agent Portal — All Financial Freedom',
  description: 'Your personal Agent Progression Tracker',
}

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <AgentSessionProvider>{children}</AgentSessionProvider>
}
