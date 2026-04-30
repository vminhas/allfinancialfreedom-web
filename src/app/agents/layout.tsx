import type { Metadata, Viewport } from 'next'
import AgentSessionProvider from './AgentSessionProvider'
import PullToRefresh from '@/components/PullToRefresh'

export const metadata: Metadata = {
  title: 'Agent Portal · All Financial Freedom',
  description: 'Your personal Agent Progression Tracker',
  // Tell iOS this app is installable and behaves like a standalone app
  // when launched from the home screen via "Add to Home Screen".
  appleWebApp: {
    capable: true,
    title: 'AFF Agent',
    statusBarStyle: 'black-translucent',
  },
  // Explicit icon links so iOS Safari's "Add to Home Screen" finds them
  // reliably. Leaving Next.js's apple-icon.tsx file convention to work
  // alone wasn't enough — Safari was falling back to its auto-generated
  // first-letter icon because the link tag wasn't reaching the HTML.
  // The ?v=2 cache-buster forces Safari to re-fetch even if it cached
  // the page metadata pre-fix.
  icons: {
    apple: [
      { url: '/agents/apple-icon?v=2', sizes: '180x180', type: 'image/png' },
    ],
    icon: [
      { url: '/agents/apple-icon?v=2', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  // Explicit on the agents layout so iOS Safari (especially in
  // standalone "Add to Home Screen" mode) honors zoom and renders
  // at the right base size. Without these, agents reported the app
  // getting "stuck zoomed in" with no way to pinch back out, plus
  // a few cases where the page rendered at desktop width on phones.
  width: 'device-width',
  initialScale: 1,
  // Allow zoom up to 5x. Mobile Safari in standalone mode treats
  // userScalable inconsistently across iOS versions, so spelling
  // out maximumScale gives us the most reliable behavior.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
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
