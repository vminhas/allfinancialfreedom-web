import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
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
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
