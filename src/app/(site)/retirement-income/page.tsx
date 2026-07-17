import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import Footer from '@/components/Footer'
import AnnuityLeadForm from '@/components/AnnuityLeadForm'

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

// What the person gets for filling out the form. Stating the payoff plainly
// lifts conversion; copy stays compliant (no "guaranteed / never lose money").
const ESTIMATE_INCLUDES: { lead: string; rest: string }[] = [
  { lead: 'An estimated monthly income figure', rest: ' based on your savings and timeline.' },
  { lead: 'Options matched to your situation', rest: ', explained in plain language, not a sales pitch.' },
  { lead: 'Ways to help protect against market loss', rest: ' as you approach retirement.' },
  { lead: 'A no-pressure review call', rest: ' on your schedule. Decide only if it fits.' },
]

const TRUST: { title: string; sub: string; icon: ReactNode }[] = [
  {
    title: 'Licensed agency',
    sub: 'A licensed U.S. insurance agency',
    icon: <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />,
  },
  {
    title: '$0 cost',
    sub: 'No cost, no obligation',
    icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />,
  },
  {
    title: 'Private',
    sub: 'Your details stay private',
    icon: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  },
]

// Short FAQ beside the form. Genuinely useful, compliance-safe, and mirrors
// the JSON-LD FAQ. Also gives the left column enough height to balance the
// long form on the right.
const FAQ: { q: string; a: string }[] = [
  { q: 'Is the estimate really free?', a: 'Yes. There is no cost and no obligation to buy anything.' },
  { q: 'Will someone call me?', a: 'A licensed insurance agent from All Financial Freedom will reach out to review your estimate with you. No pressure.' },
  { q: 'What exactly is an annuity?', a: 'An insurance product that can turn part of your savings into retirement income. Any guarantees are subject to the issuing insurer’s claims-paying ability.' },
  { q: 'Is my information private?', a: 'Yes. Your details are used only to prepare your estimate and are never sold.' },
]

const blockLabel: CSSProperties = {
  color: '#C9A96E',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '1.6px',
  textTransform: 'uppercase',
  margin: '0 0 14px',
}

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
        {/* Grid areas: on desktop the intro (row 1) and supporting content
            (row 2) share the left column while the video+form card spans both
            rows on the right. On mobile the order utilities restack it as
            intro -> video+form -> supporting, so the form is never buried under
            the supporting content. */}
        <div className="max-w-6xl mx-auto px-6 grid gap-12 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">

          {/* Intro */}
          <div className="order-1 lg:col-start-1 lg:row-start-1 max-w-xl">
            <span className="section-label">Retirement Income</span>
            <h1 className="section-title-light mb-5">
              Turn retirement savings into <em>reliable income</em> for life.
            </h1>
            <p className="rich-text-light max-w-md" style={{ marginBottom: 0 }}>
              Answer 4 quick questions and a licensed annuity professional from All Financial Freedom
              will prepare a personalized, no-obligation income estimate. No cost. No pressure.
            </p>
          </div>

          {/* Supporting content. Flex column stretched to the row so the trust
              strip anchors to the bottom, lining up with the end of the form. */}
          <div className="order-3 lg:col-start-1 lg:row-start-2 lg:h-full max-w-xl flex flex-col">
            <p style={blockLabel}>Why request an estimate</p>
            <ul className="space-y-5" style={{ marginBottom: 30 }}>
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

            <div style={{ height: 1, background: 'rgba(201,169,110,0.22)', margin: '30px 0' }} />

            <p style={blockLabel}>What your free estimate includes</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px', display: 'grid', gap: 12 }}>
              {ESTIMATE_INCLUDES.map(it => (
                <li key={it.lead} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 14, color: '#CDD9E5', lineHeight: 1.5 }}>
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#C9A96E" strokeWidth="2.2" style={{ flex: '0 0 19px', marginTop: 1 }}><path d="M20 6L9 17l-5-5" /></svg>
                  <span><b style={{ color: '#fff', fontWeight: 600 }}>{it.lead}</b>{it.rest}</span>
                </li>
              ))}
            </ul>

            <div style={{ height: 1, background: 'rgba(201,169,110,0.22)', margin: '0 0 30px' }} />

            <p style={blockLabel}>Common questions</p>
            <dl style={{ margin: '0 0 30px' }}>
              {FAQ.map(f => (
                <div key={f.q} style={{ marginBottom: 16 }}>
                  <dt style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{f.q}</dt>
                  <dd style={{ margin: 0, color: '#9BB0C4', fontSize: 13.5, lineHeight: 1.55 }}>{f.a}</dd>
                </div>
              ))}
            </dl>

            {/* Anchored to the bottom of the column so it lines up near the end
                of the form on the right. */}
            <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {TRUST.map(t => (
                <div key={t.title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,169,110,0.18)', borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#C9A96E" strokeWidth="2" style={{ marginBottom: 8 }}>{t.icon}</svg>
                  <b style={{ display: 'block', fontSize: 12.5, color: '#fff', marginBottom: 2 }}>{t.title}</b>
                  <span style={{ fontSize: 11, color: '#8BA0B6', lineHeight: 1.35, display: 'block' }}>{t.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Creator video sitting directly on top of the always-visible form,
              so his "click below for a free estimate" lands literally, no extra
              click and no lost leads. Spans both rows on the right on desktop;
              sits second (right after the intro) on mobile. */}
          <div
            className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 self-start card-premium"
            style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 50px rgba(11,25,44,0.28)' }}
          >
            <video
              controls
              playsInline
              preload="metadata"
              poster="/retirement-income-video-poster.jpg"
              style={{ display: 'block', width: '100%', height: 300, objectFit: 'cover', background: '#000' }}
            >
              <source src="/retirement-income-video.mp4" type="video/mp4" />
            </video>
            {/* Connector strip: bridges the video's spoken CTA into the form. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#FAF6EE', color: '#9A7B3F', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', padding: 9, borderBottom: '1px solid #EFE6D3' }}>
              Your free estimate is right here
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14m0 0l-6-6m6 6l6-6" /></svg>
            </div>
            <div style={{ padding: '22px 26px 26px' }}>
              <h2 className="font-serif text-navy" style={{ fontSize: '1.5rem', lineHeight: 1.15, marginBottom: 6 }}>
                Get Your Free Retirement Income Estimate
              </h2>
              <p style={{ fontSize: 13, color: '#6B8299', marginBottom: 20 }}>
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
