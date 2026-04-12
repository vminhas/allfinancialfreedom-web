import Navbar from '@/components/Navbar'
import BookingModal from '@/components/BookingModal'
import JoinModal from '@/components/JoinModal'
import Script from 'next/script'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <BookingModal />
      <JoinModal />
      {children}
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
    </>
  )
}
