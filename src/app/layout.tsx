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
        {/* Microsoft Advertising (Bing) UET tag, sitewide. Tag ID 343260726
            (override via NEXT_PUBLIC_UET_TAG_ID if it ever rotates).
            enableAutoSpaTracking fires pageLoad on client navigations so a
            Destination-URL goal on the thank-you page works; the actual lead
            conversion is fired as a UET custom event in the lead form's success
            callback (see AnnuityLeadForm) to match Google's generate_lead. */}
        <Script id="uet-init" strategy="lazyOnload">{`
          (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${process.env.NEXT_PUBLIC_UET_TAG_ID || '343260726'}", enableAutoSpaTracking:true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");
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
