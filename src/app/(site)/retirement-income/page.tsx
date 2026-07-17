import type { Metadata } from 'next'
import Footer from '@/components/Footer'
import AnnuityLeadForm from '@/components/AnnuityLeadForm'
import EstimateCtaButton from '@/components/EstimateCtaButton'

export const metadata: Metadata = {
  title: 'Free Retirement Income Estimate | All Financial Freedom',
  description:
    'Answer 4 quick questions and a licensed annuity professional will prepare a personalized, ' +
    'no-obligation retirement income estimate. Turn retirement savings into reliable income for life. ' +
    'No cost. No pressure.',
  keywords:
    'retirement income, annuity, annuities, retirement income estimate, income for life, ' +
    'lifetime income annuity, protect retirement savings, retirement planning, annuity quote, ' +
    'reliable retirement income, 401k rollover, IRA rollover annuity',
  alternates: { canonical: '/retirement-income' },
  openGraph: {
    title: 'Free Retirement Income Estimate | All Financial Freedom',
    description:
      'Turn retirement savings into reliable income for life. Get a personalized, no-obligation ' +
      'estimate from a licensed annuity professional. No cost. No pressure.',
    url: 'https://allfinancialfreedom.com/retirement-income',
    siteName: 'All Financial Freedom',
    type: 'website',
  },
}

const VALUE_POINTS = [
  {
    title: 'Income you can plan around',
    body: 'An annuity can turn a portion of your savings into a predictable stream of retirement income, designed around when you need it and how long it should last.',
  },
  {
    title: 'A buffer from market swings',
    body: 'Certain annuities are built to help shield part of your retirement money from market losses, so a downturn near retirement does not derail your plan.',
  },
  {
    title: 'A licensed professional, not a call center',
    body: 'Your estimate is prepared by a licensed annuity and insurance professional who walks you through the options. No cost, and no obligation to buy.',
  },
]

const STEPS = [
  { step: '01', title: 'Answer 4 questions', text: 'Tell us your age, savings range, timing, and what matters most. It takes under a minute.' },
  { step: '02', title: 'Get your estimate', text: 'A licensed annuity professional prepares a personalized, no-obligation retirement income estimate for you.' },
  { step: '03', title: 'Decide on your terms', text: 'Review it on a quick call. If it fits, great. If not, there is no pressure and no cost.' },
]

// Structured data: describes the offering (a retirement income estimate
// from a licensed insurance agency) plus a short FAQ. Helps search engines
// understand the page and can surface rich results. Copy stays compliant
// (no "guaranteed / never lose money / risk-free"; states a licensed agent
// will make contact).
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      name: 'Retirement Income Estimate',
      serviceType: 'Annuity and retirement income planning',
      provider: {
        '@type': 'FinancialService',
        name: 'All Financial Freedom',
        url: 'https://allfinancialfreedom.com',
        email: 'contact@allfinancialfreedom.com',
      },
      areaServed: 'US',
      description:
        'A free, no-obligation retirement income estimate prepared by a licensed annuity professional. ' +
        'A licensed insurance agent will contact you.',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How much does the retirement income estimate cost?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Nothing. The estimate is free and there is no obligation to buy anything.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is an annuity?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'An annuity is an insurance product that can turn a portion of your savings into a stream of retirement income. Product features and any guarantees are subject to the claims-paying ability of the issuing insurer.',
          },
        },
        {
          '@type': 'Question',
          name: 'Who will contact me?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'A licensed insurance agent from All Financial Freedom, a licensed insurance agency, will contact you about annuities and retirement income products.',
          },
        },
      ],
    },
  ],
}

export default function RetirementIncomeLanding() {
  return (
    <main className="pt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      {/* HERO + FORM */}
      <section className="bg-navy-grad" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-start">

          {/* Left: education-first pitch */}
          <div className="max-w-xl">
            <span className="section-label">Retirement Income</span>
            <h1 className="section-title-light mb-5">
              Turn retirement savings into <em>reliable income</em> for life.
            </h1>
            <p className="rich-text-light mb-8 max-w-md">
              Answer 4 quick questions and a licensed annuity professional from All Financial Freedom
              will prepare a personalized, no-obligation income estimate. No cost. No pressure.
            </p>
            {/* Creator video (repurposed from a Meta ad). Lives beside the
                estimate form so its "click below for a free estimate" ask lands
                right where the form is. On mobile the button jumps to the form. */}
            <div style={{ marginBottom: 32, maxWidth: 380 }}>
              <video
                controls
                playsInline
                preload="metadata"
                poster="/retirement-income-video-poster.jpg"
                style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid rgba(201,169,110,0.25)', display: 'block', background: '#000' }}
              >
                <source src="/retirement-income-video.mp4" type="video/mp4" />
              </video>
              <EstimateCtaButton />
            </div>
            <ul className="space-y-5">
              {VALUE_POINTS.map(v => (
                <li key={v.title} className="flex items-start gap-3">
                  <span style={{ color: '#C9A96E', flexShrink: 0, marginTop: 4, fontSize: '0.7rem' }}>◆</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{v.title}</div>
                    <div style={{ color: '#9BB0C4', fontSize: 13.5, lineHeight: 1.55 }}>{v.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: the form card */}
          <div
            id="estimate-form"
            className="card-premium"
            style={{ background: '#fff', padding: '28px 26px', borderRadius: 10, boxShadow: '0 20px 50px rgba(11,25,44,0.28)', scrollMarginTop: 90 }}
          >
            <h2 className="font-serif text-navy" style={{ fontSize: '1.55rem', lineHeight: 1.15, marginBottom: 6 }}>
              Get Your Free Retirement Income Estimate
            </h2>
            <p style={{ fontSize: 13, color: '#6B8299', marginBottom: 22 }}>
              Four quick questions, then your contact details. A licensed professional handles the rest.
            </p>
            <AnnuityLeadForm />
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #EDF1F6', textAlign: 'center' }}>
              <span style={{ fontSize: 12.5, color: '#6B8299' }}>Prefer to pick a time? </span>
              <a href="/schedule" style={{ fontSize: 12.5, fontWeight: 700, color: '#C9A96E', textDecoration: 'underline' }}>
                Schedule your free assessment
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="page-section bg-white-section">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <span className="section-label">How It Works</span>
            <h2 className="section-title mb-3">Your estimate in three simple steps</h2>
            <p className="rich-text">No paperwork to start. Just answer a few questions.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((item, i) => (
              <div key={item.step} className="relative card-premium p-8">
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 right-0 w-8 h-px"
                    style={{ background: 'rgba(201,169,110,0.3)', transform: 'translateX(100%)' }} />
                )}
                <div className="font-serif font-light mb-4" style={{ fontSize: '3.5rem', color: 'rgba(201,169,110,0.2)', lineHeight: 1 }}>
                  {item.step}
                </div>
                <span className="gold-rule" />
                <h3 className="font-serif text-xl mb-3 text-navy">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-blue">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPLIANCE / DISCLOSURES */}
      <section className="bg-sky" style={{ padding: '40px 0' }}>
        <div className="max-w-3xl mx-auto px-6">
          <p style={{ fontSize: 11.5, lineHeight: 1.65, color: '#6B8299', margin: 0 }}>
            All Financial Freedom is a licensed insurance agency. This is a solicitation for insurance;
            a licensed insurance agent will contact you about annuities and retirement income products.
            Annuities are insurance products and are not bank deposits, are not FDIC insured, and are not
            guaranteed by any bank or government agency. Product features and any guarantees are subject to
            the claims-paying ability of the issuing insurer and to the terms of the contract, including
            limitations, surrender charges, and fees. Product availability varies by state. This page is for
            informational purposes only and is not financial, tax, or legal advice.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
