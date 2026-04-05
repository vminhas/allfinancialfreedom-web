import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import BookingModal from '@/components/BookingModal'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata: Metadata = {
  title: 'All Financial Freedom — Build Wealth. Protect Your Legacy.',
  description: 'Personalized strategies for wealth-building, protection, insurance, budgeting, and legacy planning. Helping individuals, families, and businesses create lasting financial freedom.',
  keywords: 'financial planning, wealth building, life insurance, retirement planning, legacy planning, financial freedom, all financial freedom',
  openGraph: {
    title: 'All Financial Freedom',
    description: 'Build wealth, protect your legacy, and achieve financial freedom — with a team that puts you first.',
    url: 'https://allfinancialfreedom.com',
    siteName: 'All Financial Freedom',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <BookingModal />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
