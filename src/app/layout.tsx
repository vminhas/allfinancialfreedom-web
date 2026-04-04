import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import BookingModal from '@/components/BookingModal'

export const metadata: Metadata = {
  title: 'All Financial Freedom — Empower Your Future',
  description: 'Personalized strategies for wealth-building, protection, insurance, budgeting, and legacy planning. We help individuals, families, and businesses create lasting financial freedom.',
  keywords: 'financial planning, wealth building, insurance, retirement planning, legacy planning, financial freedom',
  openGraph: {
    title: 'All Financial Freedom',
    description: 'Building a future you feel confident in.',
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
      </body>
    </html>
  )
}
