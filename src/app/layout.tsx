import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import AttributionCapture from '@/components/AttributionCapture'

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
        {/* Preconnects: warm up the TCP+TLS handshake to the 3rd-party
            origins the page hits during LCP. Lighthouse measured ~330ms
            saved per origin on mobile 4G. Cap at 4 (Chrome's effective
            limit before connections start to evict each other). Order
            matters slightly: hint the LCP-critical ones first. */}
        <link rel="preconnect" href="https://widgets.leadconnectorhq.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://services.leadconnectorhq.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://assets.cdn.filesafe.space" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://stcdn.leadconnectorhq.com" crossOrigin="anonymous" />

        {/* GTM moved from 'afterInteractive' to 'lazyOnload' so the
            main thread is unblocked through LCP on mobile (saved ~64KB
            of unused JS during the critical window per Lighthouse).
            Lazy-loaded GTM still fires page_view normally because the
            event queues until gtag is defined; user-triggered events
            also queue. Trade-off: events fired in the very first
            second after page load may not include their full GTM
            envelope, which is fine for our use case (no rage-click
            funnels). */}
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-V681CCKX2T" strategy="lazyOnload" />
        <Script id="gtag-init" strategy="lazyOnload">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-V681CCKX2T');
        `}</Script>
      </head>
      <body>
        <AttributionCapture />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
