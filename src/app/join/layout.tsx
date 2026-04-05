import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Join Our Team | All Financial Freedom',
  description: 'Build a licensed financial services career with All Financial Freedom. Part-time, full-time, and agency owner pathways available. No experience required — we provide full training and licensing support.',
  keywords: 'financial services career, insurance agent career, become a financial advisor, licensed insurance agent, work from home financial services, build a financial agency, life insurance career, join financial freedom team',
  openGraph: {
    title: 'Join Our Team | All Financial Freedom',
    description: 'Build a licensed financial services business with full training, carrier access, and mentorship. Part-time, full-time, and agency owner pathways available.',
    url: 'https://allfinancialfreedom.com/join',
    siteName: 'All Financial Freedom',
    type: 'website',
  },
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children
}
