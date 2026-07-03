import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'

// DRAFT pending IMO / carrier compliance sign-off. Kept out of the index
// until approved (the link still works for post-form delivery). To publish:
// flip robots to { index: true, follow: true } and remove this note.
export const metadata: Metadata = {
  title: 'The Retirement Income Guide | All Financial Freedom',
  description:
    'A plain-English guide to fixed and fixed-indexed annuities: what they are, what they can and '
    + 'cannot do, and how to tell if one fits your retirement. Educational. No cost. No pressure.',
  alternates: { canonical: '/retirement-income/guide' },
  robots: { index: false, follow: false },
}

const PHONE_DISPLAY = '917-603-5893'
const PHONE_TEL = '+19176035893'

const CONTENTS = [
  'The retirement question no one prepares you for',
  'What an annuity actually is',
  'Three things a fixed annuity can do',
  'Fixed vs. fixed-indexed, in plain English',
  'The trade-offs worth knowing',
  'Is it a fit for you?',
  'Common questions',
]

const BENEFITS = [
  {
    title: 'Income you can count on for life',
    body: 'A fixed annuity can be set up to pay you a steady amount every month for as long as you live, no matter how long that is. Those income guarantees are backed by the claims-paying ability of the issuing insurer.',
  },
  {
    title: 'Protection from market loss',
    body: 'A fixed-indexed annuity is designed to protect the money you put in from market downturns. When the market falls, your principal is not exposed to those losses (though growth in a given year may be limited).',
  },
  {
    title: 'Tax-deferred growth',
    body: 'Growth inside the annuity is generally not taxed until you withdraw it, which can let it compound over time. Withdrawals are taxable, and if taken before age 59½ may be subject to a penalty. This is not tax advice; consult a tax professional.',
  },
]

const TRADEOFFS = [
  { h: 'Surrender charges', b: 'Annuities are meant to be held for a set number of years. Taking out more than the allowed amount early can trigger a surrender charge.' },
  { h: 'Liquidity', b: 'This is money you should not need all at once. Keep a separate emergency fund outside of it.' },
  { h: 'Taxes', b: 'Withdrawals of growth are taxable as income, and withdrawals before age 59½ may carry a 10% federal penalty.' },
  { h: 'Not for every dollar', b: 'An annuity is one option, not the answer for everything. It tends to fit a portion of your savings, not all of it.' },
  { h: 'It varies by state', b: 'Products, features, and rates differ by state and are subject to availability and change.' },
]

const FITS = [
  'You are within about ten years of retirement, or already retired',
  'You want part of your money to be protected and predictable',
  'You worry about a market drop right before or early in retirement',
  'You would value a "personal pension" style income you cannot outlive',
  'You have savings you will not need to access all at once',
]

const FAQS = [
  {
    q: 'Is my money safe in an annuity?',
    a: 'Fixed and fixed-indexed annuities are designed to protect your principal from market loss. Guarantees are backed by the claims-paying ability of the issuing insurer, not by the FDIC. Annuities are not bank deposits and are not FDIC insured.',
  },
  {
    q: 'Can I lose my principal to a market drop?',
    a: 'With a fixed or fixed-indexed annuity, your principal is not exposed to market losses. Note that withdrawing more than your contract allows during the surrender period can reduce your value through surrender charges.',
  },
  {
    q: 'What happens to the money when I pass away?',
    a: 'Most annuities let you name a beneficiary who receives the remaining value or a death benefit. The specifics vary by product and state.',
  },
  {
    q: 'How do I know how much income I could get?',
    a: 'It depends on your age, how much you place, and when you start income. A licensed professional can prepare a personalized, no-obligation estimate for you.',
  },
  {
    q: 'Is this the same as an investment?',
    a: 'No. An annuity is an insurance product, not an investment account. This guide does not cover variable annuities, which are securities.',
  },
]

const Num = ({ n }: { n: string }) => (
  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.15em', color: '#C9A96E', display: 'block', marginBottom: 10 }}>{n}</span>
)

const Check = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" stroke="#C9A96E" fill="none" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export default function RetirementIncomeGuide() {
  return (
    <main className="pt-20">
      {/* Hero */}
      <section className="bg-navy-grad" style={{ paddingTop: 76, paddingBottom: 64 }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="section-label">Free Retirement Income Guide</span>
          <h1 className="section-title-light" style={{ marginBottom: 18 }}>
            How retirees turn savings into <em>income for life</em>
          </h1>
          <p className="rich-text-light mx-auto" style={{ maxWidth: 560, marginBottom: 22 }}>
            A plain-English guide to fixed and fixed-indexed annuities: what they are, what they can
            (and cannot) do, and how to tell if one fits your retirement.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Educational guide', 'Written for ages 55+', 'About a 7 minute read'].map(t => (
              <span key={t} style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: '#9BB0C4', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 100, padding: '6px 14px' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Contents */}
      <section className="bg-sky-2" style={{ padding: '40px 0' }}>
        <div className="max-w-3xl mx-auto px-6">
          <div style={{ background: '#ffffff', border: '1px solid rgba(59,126,200,0.14)', borderRadius: 12, padding: '26px 28px' }}>
            <div className="section-label-blue" style={{ marginBottom: 14 }}>What is inside</div>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {CONTENTS.map((c, i) => (
                <li key={c} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 15, color: '#1A2B3C' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#C9A96E', minWidth: 20 }}>{String(i + 1).padStart(2, '0')}</span>
                  {c}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 1. The problem */}
      <section className="bg-white-section page-section">
        <div className="max-w-2xl mx-auto">
          <Num n="01" />
          <h2 className="section-title" style={{ marginBottom: 20 }}>
            The retirement question <em>no one prepares you for</em>
          </h2>
          <div className="rich-text" style={{ fontSize: '1.02rem' }}>
            <p style={{ marginBottom: 16 }}>
              For 40 years the advice was simple: save into your 401(k). But almost no one teaches the
              second half, how to turn that savings into a paycheck once the working paychecks stop.
            </p>
            <p style={{ marginBottom: 16 }}>
              Your parents or grandparents may have had a pension: a check that arrived every month for
              life. Most of us do not get that anymore. So the job of making savings last 20, 30, even 35
              years now falls on us.
            </p>
            <p style={{ margin: 0 }}>
              It is why the most common worry in retirement is not what you might expect. Surveys keep
              finding the same thing: retirees fear running out of money more than almost anything else.
            </p>
          </div>
          <blockquote style={{ margin: '30px 0 0', padding: '18px 24px', borderLeft: '3px solid #C9A96E', background: '#F5F9FF', borderRadius: '0 8px 8px 0', fontSize: '1.05rem', fontStyle: 'italic', color: '#1A2B3C', lineHeight: 1.6 }}>
            Most people spend decades learning how to save. Almost no one is taught how to spend it down
            without the fear of running out.
          </blockquote>
        </div>
      </section>

      {/* 2. What an annuity is */}
      <section className="bg-sky page-section">
        <div className="max-w-2xl mx-auto">
          <Num n="02" />
          <h2 className="section-title" style={{ marginBottom: 20 }}>
            What an annuity <em>actually is</em>
          </h2>
          <div className="rich-text" style={{ fontSize: '1.02rem' }}>
            <p style={{ marginBottom: 16 }}>
              An annuity is an insurance product. In plain English, it is a contract with an insurance
              company: you place a portion of your savings with the insurer, and in return the company
              agrees to protect that money and pay it back to you as income, often for the rest of your
              life.
            </p>
            <p style={{ marginBottom: 16 }}>
              It is not a bank deposit, and it is not an investment account. It is one tool, among several,
              that some retirees use for the part of their money they want to be predictable.
            </p>
            <p style={{ margin: 0 }}>
              This guide covers <strong>fixed</strong> and <strong>fixed-indexed</strong> annuities. It does
              not cover variable annuities, which work differently and are regulated as securities.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Three things it can do */}
      <section className="bg-white-section page-section">
        <div className="max-w-4xl mx-auto">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Num n="03" />
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Three things a fixed annuity <em>can do</em>
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {BENEFITS.map(b => (
              <div key={b.title} style={{ background: '#F5F9FF', border: '1px solid rgba(59,126,200,0.12)', borderRadius: 12, padding: '26px 24px' }}>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: '#1A2B3C', marginBottom: 12 }}>{b.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.75, color: '#6B8299', margin: 0 }}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stat callout */}
      <section className="bg-navy-grad" style={{ padding: '52px 0' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div style={{ fontSize: 46, fontWeight: 700, color: '#C9A96E', lineHeight: 1, marginBottom: 14 }}>$464 billion</div>
          <p className="rich-text-light mx-auto" style={{ maxWidth: 520, marginBottom: 8 }}>
            Americans moved a record $464.1 billion into annuities in 2025, a fourth straight record year,
            as more retirees looked for one part of their money that was protected and predictable.
          </p>
          <p style={{ fontSize: 11, color: '#6B8299', margin: 0 }}>Source: LIMRA, 2025 U.S. retail annuity sales.</p>
        </div>
      </section>

      {/* 4. Fixed vs fixed-indexed */}
      <section className="bg-sky page-section">
        <div className="max-w-4xl mx-auto">
          <div style={{ marginBottom: 34 }}>
            <Num n="04" />
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Fixed vs. fixed-indexed, <em>in plain English</em>
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            <div style={{ background: '#ffffff', border: '1px solid rgba(59,126,200,0.14)', borderRadius: 12, padding: '26px 26px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1A2B3C', marginBottom: 12 }}>Fixed annuity</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.8, color: '#6B8299', margin: 0 }}>
                A set interest rate for a set period. It can feel similar to a CD, but it is an insurance
                product with tax-deferred growth (an annuity is different from a CD). A good fit when you
                want simple and predictable.
              </p>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid rgba(59,126,200,0.14)', borderRadius: 12, padding: '26px 26px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1A2B3C', marginBottom: 12 }}>Fixed-indexed annuity</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.8, color: '#6B8299', margin: 0 }}>
                Your credited growth is tied to a market index, with a floor that protects your principal
                from loss in down years and a cap or participation rate that limits how much you earn in up
                years. Index credits are not guaranteed. A good fit when you want protection with a chance
                for more than a fixed rate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Trade-offs */}
      <section className="bg-white-section page-section">
        <div className="max-w-2xl mx-auto">
          <Num n="05" />
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            The trade-offs <em>worth knowing</em>
          </h2>
          <p className="rich-text" style={{ marginBottom: 26 }}>
            An honest guide names the downsides too. An annuity is not right for everyone, and here is what
            to weigh before you decide.
          </p>
          <div style={{ display: 'grid', gap: 2 }}>
            {TRADEOFFS.map(t => (
              <div key={t.h} style={{ padding: '18px 0', borderBottom: '1px solid rgba(59,126,200,0.12)' }}>
                <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#1A2B3C', marginBottom: 5 }}>{t.h}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.7, color: '#6B8299', margin: 0 }}>{t.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Is it a fit */}
      <section className="bg-sky page-section">
        <div className="max-w-2xl mx-auto">
          <Num n="06" />
          <h2 className="section-title" style={{ marginBottom: 20 }}>
            Is it a fit <em>for you?</em>
          </h2>
          <p className="rich-text" style={{ marginBottom: 22 }}>
            An annuity tends to be worth exploring if you can say yes to a few of these:
          </p>
          <div style={{ display: 'grid', gap: 14 }}>
            {FITS.map(f => (
              <div key={f} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Check />
                <span style={{ fontSize: 15.5, color: '#1A2B3C', lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>
          <p className="rich-text" style={{ marginTop: 24, marginBottom: 0 }}>
            It is probably not the right fit if you need full access to all of your money at any time, or you
            are comfortable leaving everything exposed to the market.
          </p>
        </div>
      </section>

      {/* 7. FAQ */}
      <section className="bg-white-section page-section">
        <div className="max-w-2xl mx-auto">
          <Num n="07" />
          <h2 className="section-title" style={{ marginBottom: 28 }}>
            Common <em>questions</em>
          </h2>
          <div style={{ display: 'grid', gap: 22 }}>
            {FAQS.map(f => (
              <div key={f.q}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1A2B3C', marginBottom: 7 }}>{f.q}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.75, color: '#6B8299', margin: 0 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-grad" style={{ padding: '64px 0' }}>
        <div className="max-w-2xl mx-auto px-6 text-center">
          <span className="section-label">Your Next Step</span>
          <h2 className="section-title-light" style={{ marginBottom: 16 }}>
            See what this could look like for <em>your</em> retirement
          </h2>
          <p className="rich-text-light mx-auto" style={{ maxWidth: 500, marginBottom: 28 }}>
            A licensed annuity professional from All Financial Freedom can walk through your options and, if
            you would like, prepare a personalized income estimate. No cost, and no obligation to buy.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={`tel:${PHONE_TEL}`} className="btn-gold" style={{ display: 'inline-block' }}>
              Call {PHONE_DISPLAY}
            </a>
            <Link href="/retirement-income" className="btn-primary" style={{ display: 'inline-block' }}>
              Get your free estimate
            </Link>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-sky-2" style={{ padding: '34px 0 44px' }}>
        <div className="max-w-3xl mx-auto px-6">
          <p style={{ fontSize: 11.5, lineHeight: 1.7, color: '#6B8299', margin: 0 }}>
            This guide is for educational purposes only and is an advertisement for fixed and fixed-indexed
            annuities, which are insurance products. It is not tax, legal, or investment advice. Annuities are
            not bank deposits, are not FDIC insured, and are not guaranteed by any bank or government agency.
            Any guarantees are backed by the claims-paying ability of the issuing insurer. Annuities have
            limitations, including surrender charges; withdrawals may be taxable and, if taken before age 59½,
            may be subject to a 10% federal tax penalty. Fixed-indexed annuities are not securities and do not
            participate directly in any stock market or index; index credits may be limited by caps, spreads,
            or participation rates. This guide does not describe variable annuities. Products, features, and
            rates vary by state and are subject to availability and change. All Financial Freedom is a licensed
            insurance agency; a licensed insurance agent will contact you. Please consult a tax professional
            regarding your specific situation.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
