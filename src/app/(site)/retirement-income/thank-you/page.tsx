import type { Metadata } from 'next'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Thank You | All Financial Freedom',
  description: 'Your request is in. A licensed annuity professional will reach out shortly.',
  robots: { index: false, follow: false },
}

const PHONE_DISPLAY = '917-603-5893'
const PHONE_TEL = '+19176035893'

export default function RetirementIncomeThankYou() {
  return (
    <main className="pt-20">
      <section className="bg-navy-grad" style={{ paddingTop: 72, paddingBottom: 80 }}>
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div
            className="mx-auto mb-7 flex items-center justify-center rounded-full"
            style={{ width: 64, height: 64, background: 'rgba(201,169,110,0.15)', border: '1.5px solid rgba(201,169,110,0.5)' }}
          >
            <svg viewBox="0 0 24 24" width="30" height="30" stroke="#C9A96E" fill="none" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <span className="section-label">Request Received</span>
          <h1 className="section-title-light mb-5">
            You&apos;re all set. <em>We&apos;ll be in touch shortly.</em>
          </h1>
          <p className="rich-text-light mb-9 mx-auto" style={{ maxWidth: 460 }}>
            Thanks for requesting your free retirement income estimate. A licensed annuity professional
            from All Financial Freedom will reach out soon to put your personalized estimate together.
            Keep an eye out for a call or text.
          </p>

          <div
            className="mx-auto"
            style={{ maxWidth: 380, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 10, padding: '24px 22px' }}
          >
            <p style={{ color: '#9BB0C4', fontSize: 13, marginBottom: 12 }}>
              Want to talk sooner? Call us now.
            </p>
            <a href={`tel:${PHONE_TEL}`} className="btn-gold" style={{ display: 'inline-block' }}>
              Call {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <section className="bg-sky" style={{ padding: '34px 0' }}>
        <div className="max-w-3xl mx-auto px-6">
          <p style={{ fontSize: 11.5, lineHeight: 1.65, color: '#6B8299', margin: 0 }}>
            All Financial Freedom is a licensed insurance agency. A licensed insurance agent will contact
            you about annuities and retirement income products. Annuities are insurance products and are not
            bank deposits, are not FDIC insured, and are not guaranteed by any bank or government agency.
            Any product guarantees are subject to the claims-paying ability of the issuing insurer.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
