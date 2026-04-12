'use client'

import Image from 'next/image'
import Link from 'next/link'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

const featured = [
  {
    title: 'Asset Protection',
    label: 'Shield What You\'ve Built',
    image: '/services/asset-protection.jpg',
    description: 'Most families spend decades building assets, and almost no time protecting them. Asset protection isn\'t just for the ultra-wealthy. It\'s for anyone who has something worth keeping. We design comprehensive strategies that shield your family, your business, and your future from life\'s inevitable risks.',
    bullets: [
      'Risk assessment & liability gap analysis',
      'Business & personal asset shielding',
      'Umbrella coverage strategy',
      'Entity structuring guidance',
    ],
    bestFor: 'Business owners, high earners, and families with real estate or growing assets.',
    readMore: { href: '/blog/asset-protection-lawsuit-financial-plan', label: 'Why lawsuit protection belongs in every financial plan' },
  },
  {
    title: 'Retirement Planning',
    label: 'Design the Life You\'ve Earned',
    image: '/services/retirement-planning.jpg',
    description: 'Retirement isn\'t an age, it\'s a number. The right plan gets you there faster and keeps you there longer. We work backwards from the lifestyle you want to build a strategy that maximizes growth, minimizes taxes, and ensures your income outlasts your expenses, no matter how long you live.',
    bullets: [
      '401(k), IRA & Roth optimization',
      'Social Security timing strategy',
      'Income distribution planning',
      'Tax-efficient withdrawal sequencing',
    ],
    bestFor: 'Adults at any stage of their career who want clarity on when and how they can retire.',
    readMore: { href: '/blog/social-security-changes-retirement-2025', label: 'What the latest Social Security changes mean for your plan' },
  },
  {
    title: 'Wealth Building',
    label: 'Turn Income Into Legacy',
    image: '/services/wealth-building.jpg',
    description: 'Income pays the bills. Wealth changes your family\'s trajectory, for generations. We help you convert your earnings into assets that grow, compound, and provide security beyond your working years. Our strategies are built around your income, timeline, and goals, not a generic template.',
    bullets: [
      'Investment strategy & portfolio guidance',
      'Index funds, annuities & IUL vehicles',
      'Cash value life insurance strategies',
      'Long-term wealth accumulation planning',
    ],
    bestFor: 'Individuals and families ready to stop surviving paycheck to paycheck and start building.',
    readMore: { href: '/blog/wealth-transfer-who-gets-rich', label: 'How the $68 trillion wealth transfer is reshaping who gets rich' },
  },
]

const supporting = [
  {
    title: 'Insurance Planning',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
    description: 'Life, health, and disability solutions that protect your family\'s income and future regardless of what happens.',
    bullets: ['Term & whole life insurance', 'Indexed universal life (IUL)', 'Disability & income protection'],
    readMore: { href: '/blog/term-vs-whole-vs-iul-life-insurance', label: 'Term vs. Whole vs. IUL: which is right for you?' },
  },
  {
    title: 'Budgeting & Planning',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    description: 'Practical systems that transform how you manage money, turning everyday decisions into long-term wealth.',
    bullets: ['Cash flow analysis & optimization', 'Debt elimination strategies', 'Emergency fund planning'],
    readMore: { href: '/blog/budgeting-framework-high-inflation-2025', label: 'A budgeting framework that works in a high-inflation economy' },
  },
  {
    title: 'Legacy Planning',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    description: 'Ensure the wealth you build outlasts you, passing to the people and causes you care about, on your terms.',
    bullets: ['Estate planning & will guidance', 'Generational wealth transfer', 'Charitable giving strategies'],
    readMore: { href: '/blog/no-will-wealth-killer', label: 'Why dying without a plan is a wealth killer' },
  },
  {
    title: 'Mortgage Protection',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    description: 'Your home is your largest asset. Mortgage protection ensures your family keeps it, no matter what happens to your income.',
    bullets: ['Mortgage payoff protection', 'Income replacement coverage', 'Disability & critical illness riders'],
    readMore: { href: '/blog/mortgage-protection-what-happens', label: 'What happens to your mortgage if you die or become disabled?' },
  },
  {
    title: 'Business Owner Strategies',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
    description: 'Business owners face unique risks and opportunities. We protect your business, reward key people, and plan your exit.',
    bullets: ['Buy-sell agreement funding', 'Key person insurance', 'Executive bonus & deferred comp'],
    readMore: { href: '/blog/key-person-insurance-business-owners', label: 'Key person insurance: coverage every business owner needs' },
  },
  {
    title: 'Family Banking',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    description: 'Use whole life insurance as your own private banking system, borrow against cash value and build wealth outside Wall Street.',
    bullets: ['Infinite banking concept (IBC)', 'Tax-free cash value growth', 'Self-directed family liquidity'],
    readMore: { href: '/blog/infinite-banking-concept-explained', label: 'How to become your own bank using life insurance' },
  },
  {
    title: 'Kids Head Start Plans',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    description: 'Give your children a financial head start most adults never had, guaranteed growth and lifelong coverage starting now.',
    bullets: ['Juvenile whole life policies', 'Locked-in insurability for life', 'Cash value for college or first home'],
    readMore: { href: '/blog/life-insurance-for-kids-head-start', label: 'Why smart parents buy life insurance for their kids' },
  },
  {
    title: 'Long-Term Care Planning',
    icon: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
    description: 'Nursing home care averages $9,000/month. Without a plan, one health event can erase decades of savings. We help families protect against it.',
    bullets: ['Long-term care insurance options', 'Hybrid life & LTC policies', 'Preservation of retirement assets'],
    readMore: { href: '/blog/long-term-care-planning-protect-retirement', label: 'The $9,000-a-month risk nobody plans for in retirement' },
  },
]

export default function Services() {
  const openBooking = () => window.dispatchEvent(new CustomEvent('open-booking'))

  return (
    <main className="pt-20">

      {/* HERO */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-2xl">
          <span className="section-label">What We Offer</span>
          <h1 className="section-title-light mb-5">
            Comprehensive strategies for<br /><em>every chapter</em> of your life.
          </h1>
          <p className="rich-text-light max-w-md">
            From your first budget to your lasting legacy, we are with you at every step.
          </p>
        </div>
      </section>

      {/* FEATURED SERVICES, alternating image/text */}
      <section className="bg-white-section">
        {featured.map((service, i) => (
          <div key={service.title} id={service.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')} style={{ scrollMarginTop: '80px' }}>
            <div className={`grid md:grid-cols-2 items-stretch max-w-none ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}>

              {/* Image */}
              <div className="relative overflow-hidden" style={{ minHeight: 420 }}>
                <Image
                  src={service.image}
                  alt={service.title}
                  fill
                  className="object-cover"
                />
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0" style={{
                  background: i % 2 === 0
                    ? 'linear-gradient(to right, transparent 60%, rgba(255,255,255,0.05))'
                    : 'linear-gradient(to left, transparent 60%, rgba(255,255,255,0.05))',
                }} />
              </div>

              {/* Content */}
              <div className={`flex flex-col justify-center px-10 md:px-16 py-16 ${i % 2 === 1 ? 'bg-white' : 'bg-white'}`}
                style={{ background: i === 1 ? '#F5F9FF' : '#ffffff' }}>
                <span className="section-label">{service.label}</span>
                <h2 className="font-serif font-light text-navy mb-5" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', lineHeight: 1.15 }}>
                  {service.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-blue mb-6 max-w-lg">
                  {service.description}
                </p>
                <ul className="space-y-2.5 mb-6">
                  {service.bullets.map(bullet => (
                    <li key={bullet} className="flex items-start gap-2.5 text-sm text-muted-blue">
                      <span style={{ color: '#C9A96E', flexShrink: 0, marginTop: 2, fontSize: '0.65rem' }}>◆</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
                <div className="mb-6 text-xs" style={{ color: '#6B8299', borderLeft: '2px solid rgba(201,169,110,0.4)', paddingLeft: '0.75rem' }}>
                  <span style={{ color: '#C9A96E', fontWeight: 500, display: 'block', marginBottom: 2, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.6rem' }}>Best for</span>
                  {service.bestFor}
                </div>
                <div className="flex items-center gap-5 flex-wrap">
                  <button onClick={openBooking} className="btn-gold">Schedule a Free Call</button>
                  {service.readMore && (
                    <Link href={service.readMore.href} style={{ fontSize: '0.72rem', color: '#6B8299', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      Read more &rarr;
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Gold divider between rows */}
            {i < featured.length - 1 && (
              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,169,110,0.2), transparent)' }} />
            )}
          </div>
        ))}
      </section>

      {/* SUPPORTING SERVICES */}
      <section className="page-section bg-sky">
        <div className="text-center mb-12">
          <span className="section-label">Also Available</span>
          <h2 className="section-title">Rounding out your<br /><em>complete financial plan.</em></h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {supporting.map(service => (
            <div key={service.title} id={service.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')} style={{ scrollMarginTop: '80px' }} className="card-premium p-8 flex flex-col">
              <div className="w-12 h-12 mb-5 flex items-center justify-center rounded-full text-white"
                style={{ background: 'linear-gradient(135deg, #1B3A5C, #2A5280)' }}>
                {service.icon}
              </div>
              <span className="gold-rule" />
              <h3 className="font-serif text-xl text-navy mb-3">{service.title}</h3>
              <p className="text-sm leading-relaxed text-muted-blue mb-5">{service.description}</p>
              <ul className="space-y-2 mb-4">
                {service.bullets.map(bullet => (
                  <li key={bullet} className="flex items-start gap-2 text-xs text-muted-blue">
                    <span style={{ color: '#C9A96E', flexShrink: 0, marginTop: 1, fontSize: '0.65rem' }}>◆</span>
                    {bullet}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                {service.readMore && (
                  <Link href={service.readMore.href} style={{ fontSize: '0.68rem', color: '#6B8299', textDecoration: 'underline', textUnderlineOffset: 3, display: 'inline-block' }}>
                    Read more &rarr;
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="page-section bg-white-section">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <span className="section-label">How It Works</span>
            <h2 className="section-title mb-3">Three steps to financial freedom</h2>
            <p className="rich-text">We meet you where you are and build a plan that grows with you.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Schedule a Free Call',
                text: 'Start with a no-pressure conversation about your goals, situation, and what financial freedom means to you.',
              },
              {
                step: '02',
                title: 'Get Your Plan',
                text: 'We build a personalized strategy covering protection, growth, and legacy, tailored to your life.',
              },
              {
                step: '03',
                title: 'Build Your Future',
                text: 'With ongoing support and guidance, we help you execute the plan and stay on track toward your goals.',
              },
            ].map((item, i) => (
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
          <div className="text-center mt-12">
            <button onClick={openBooking} className="btn-gold">Schedule Your Free Call</button>
          </div>
        </div>
      </section>

      <CTABanner heading="Not sure where to start? Let us figure it out together." />
      <Footer />
    </main>
  )
}
