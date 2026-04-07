import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import Navbar from '@/components/Navbar'
import BookingModal from '@/components/BookingModal'
import JoinModal from '@/components/JoinModal'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://allfinancialfreedom.com'),
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  title: 'All Financial Freedom | Build Wealth. Protect Your Legacy.',
  description: 'Personalized strategies for wealth-building, protection, insurance, budgeting, and legacy planning. Helping individuals, families, and businesses create lasting financial freedom.',
  keywords: 'financial planning, wealth building, life insurance, retirement planning, legacy planning, financial freedom, all financial freedom, financial advisor, insurance planning, asset protection',
  openGraph: {
    title: 'All Financial Freedom | Build Wealth. Protect Your Legacy.',
    description: 'Personalized strategies for wealth-building, protection, insurance, budgeting, and legacy planning. Helping families and businesses create lasting financial freedom.',
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
      <head>
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-V681CCKX2T" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-V681CCKX2T');
        `}</Script>
      </head>
      <body>
        <Navbar />
        <BookingModal />
        <JoinModal />
        {children}
        <Analytics />
        <SpeedInsights />
        <Script
          src="https://widgets.leadconnectorhq.com/loader.js"
          data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
          data-widget-id="69d2cc18a3eb88e277500144"
          strategy="lazyOnload"
        />
        <Script
          src="https://links.allfinancialfreedom.com/js/external-tracking.js"
          data-tracking-id="tk_fbb004d6eb2548739118db929f32df21"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}
