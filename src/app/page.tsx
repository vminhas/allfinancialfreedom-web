'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { IMAGES, SERVICES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

/* ─── Icon map ─────────────────────────────────────────────── */
const icons: Record<string, React.ReactNode> = {
  layers: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
  shield: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  'check-square': <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  'dollar-sign': <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  clock: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  users: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
}

/* ─── Animated counter hook ────────────────────────────────── */
function useCountUp(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime: number | null = null
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [start, target, duration])
  return count
}

/* ─── Hero stats ────────────────────────────────────────────── */
function HeroStats() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const years = useCountUp(55, 1200, visible)
  const families = useCountUp(500, 1600, visible)

  const stats = [
    { value: `${years}+`, label: 'Years Experience' },
    { value: `${families}+`, label: 'Families Served' },
    { value: '$68T', label: 'Wealth Transfer Underway' },
    { value: '5★', label: 'Client Rating' },
  ]

  return (
    <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-px mt-8 md:mt-14"
      style={{ borderTop: '1px solid rgba(201,169,110,0.2)' }}>
      {stats.map((s, i) => (
        <div key={i} className="pt-6 pr-6">
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────── */
export default function Home() {
  const openBooking = () => window.dispatchEvent(new CustomEvent('open-booking'))

  return (
    <main>

      {/* ── HERO ── */}
      <section className="relative flex items-center" style={{ height: '100vh', minHeight: 680 }}>
        {/* Background with Ken Burns slow motion effect */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="hero-bg-animate">
            <Image src={IMAGES.heroBg} alt="Financial freedom" fill className="object-cover" priority />
          </div>
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(110deg, rgba(20,45,72,0.92) 45%, rgba(20,45,72,0.55) 100%)'
          }} />
          {/* Subtle grid overlay for depth */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(201,169,110,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,110,0.03) 1px, transparent 1px)',
            backgroundSize: '80px 80px'
          }} />
        </div>

        {/* Content */}
        <div className="relative z-10 page-section w-full max-w-5xl mx-auto pt-20">
          <h1 className="font-serif font-light text-white mb-6"
            style={{ fontSize: 'clamp(2.6rem, 5vw, 4.8rem)', lineHeight: 1.08, maxWidth: '780px' }}>
            It&apos;s not just about money,<br />
            it&apos;s about building a future<br />
            you feel{' '}
            <em style={{ fontStyle: 'italic', color: '#C9A96E' }}>confident</em> in.
          </h1>

          <p className="mb-10 max-w-lg leading-relaxed" style={{ color: 'rgba(235,244,255,0.78)', fontSize: '1.02rem' }}>
            Personalized strategies for wealth-building, protection, and legacy,
            designed for real people, from every background.
          </p>

          <div className="flex gap-4 flex-wrap">
            <button onClick={openBooking} className="btn-gold">Schedule a Free Call</button>
            <Link href="/about" className="btn-ghost">Our Story</Link>
          </div>

          <HeroStats />
        </div>
      </section>

      {/* ── MISSION ── */}
      <section className="page-section bg-sky">
        <div className="text-center mb-14">
          <span className="section-label">Our Mission</span>
          <h2 className="section-title max-w-2xl mx-auto">
            We believe everyone deserves access to<br /><em>clear, empowering</em> financial guidance.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            {
              num: '01',
              title: 'What We Stand For',
              text: 'We believe everyone deserves access to clear, empowering financial guidance, no matter their background, income, or starting point.',
            },
            {
              num: '02',
              title: 'What We Do',
              text: 'We offer personalized strategies in wealth-building, protection, insurance, budgeting, and planning, designed to help individuals, families, and businesses create lasting financial freedom.',
            },
            {
              num: '03',
              title: 'Why It Matters',
              text: "Because real freedom starts with financial confidence, and we're here to make that possible, one empowered client at a time.",
            },
          ].map(card => (
            <div key={card.num} className="card-premium p-8">
              <div className="font-serif font-light mb-4" style={{ fontSize: '3.5rem', color: 'rgba(201,169,110,0.2)', lineHeight: 1 }}>{card.num}</div>
              <span className="gold-rule" />
              <h3 className="font-serif text-xl mb-3 text-navy">{card.title}</h3>
              <p className="text-sm leading-relaxed text-muted-blue">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PHOTO STRIP ── */}
      <div className="grid md:grid-cols-3" style={{ height: 380 }}>
        {[
          { src: IMAGES.strip1, label: 'Personalized Planning', sub: 'Tailored to your life' },
          { src: IMAGES.strip2, label: 'Family Guidance', sub: 'Protecting what matters most' },
          { src: IMAGES.strip3, label: 'Lasting Wealth', sub: 'Generational impact' },
        ].map(item => (
          <div key={item.label} className="relative overflow-hidden group" style={{ height: 380 }}>
            <Image src={item.src} alt={item.label} fill className="object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(20,45,72,0.85))' }} />
            <div className="absolute bottom-6 left-6">
              <div className="text-xs tracking-widest uppercase font-medium mb-1" style={{ color: '#C9A96E' }}>{item.label}</div>
              <div className="text-xs" style={{ color: 'rgba(235,244,255,0.65)' }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── WEALTH GAP ── */}
      <section className="page-section bg-white-section">
        <div className="grid md:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
          <div>
            <span className="section-label">Closing the Wealth Gap</span>
            <h2 className="section-title mb-6">A financial crossroads<br /><em>is here.</em></h2>
            <p className="rich-text mb-4">
              In a world of economic uncertainty and constant industry change, <strong>clarity is power.</strong> We&apos;re here to cut through the noise, spread real financial literacy, and create a clear path forward.
            </p>
            <p className="rich-text">
              As the baby boomer generation enters retirement, an estimated $68 trillion in wealth is expected to transfer to the next generation. Without proper financial guidance, decades of hard work could quickly erode.
            </p>
            <div className="flex gap-10 mt-10">
              <div>
                <span className="gold-rule" />
                <div className="font-serif text-4xl font-light" style={{ color: '#1B3A5C' }}>$68T</div>
                <div className="text-xs mt-1 tracking-wide" style={{ color: '#C9A96E' }}>Wealth transfer underway</div>
              </div>
              <div>
                <span className="gold-rule" />
                <div className="font-serif text-4xl font-light" style={{ color: '#1B3A5C' }}>100M</div>
                <div className="text-xs mt-1 tracking-wide" style={{ color: '#C9A96E' }}>Families we aim to empower</div>
              </div>
            </div>
            <div className="mt-10">
              <Link href="/about" className="btn-outline">Our Story</Link>
            </div>
          </div>
          <div className="relative">
            <Image src={IMAGES.wealthGap} alt="Financial empowerment" width={600} height={500}
              className="object-cover w-full" style={{ height: 500, borderRadius: 4 }} />
            <div className="absolute inset-0 -z-10" style={{
              transform: 'translate(12px, 12px)',
              border: '1px solid rgba(201,169,110,0.3)',
              borderRadius: 4
            }} />
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section className="page-section bg-sky">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <span className="section-label">What We Offer</span>
          <h2 className="section-title">Comprehensive strategies for<br /><em>every stage</em> of your journey.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {SERVICES.slice(0, 6).map(s => (
            <div key={s.title} className="card p-8 group">
              <div className="w-12 h-12 mb-5 flex items-center justify-center rounded-full text-white"
                style={{ background: 'linear-gradient(135deg, #1B3A5C, #2A5280)' }}>
                {icons[s.icon]}
              </div>
              <h3 className="font-serif text-xl mb-1 text-navy">{s.title}</h3>
              <div className="w-6 h-px mb-3" style={{ background: '#C9A96E' }} />
              <p className="text-sm leading-relaxed text-muted-blue mb-4">{s.description}</p>
              <ul className="space-y-1.5">
                {s.bullets.map((b: string) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-muted-blue">
                    <span style={{ color: '#C9A96E', marginTop: 2, flexShrink: 0 }}>→</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <Link href="/services" className="btn-primary">View All Services</Link>
        </div>
      </section>

      {/* ── CARRIER PARTNERS ── */}
      <section className="py-14 px-5 md:px-12 lg:px-20 bg-white-section">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <span className="section-label">Our Carrier Partners</span>
            <p className="text-sm text-muted-blue mt-2">
              We work with North America&apos;s most trusted insurance and financial institutions, so you always have access to the best solutions.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-4 items-center">
            {[
              { name: 'Ethos', logo: null, textStyle: { fontWeight: 700, letterSpacing: '0.18em', fontSize: '1.1rem' } },
              { name: 'North American', logo: null, textStyle: { fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.06em', lineHeight: 1.3 } },
              { name: 'Corebridge Financial', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9c/Corebridge_financial_logo.svg/250px-Corebridge_financial_logo.svg.png', textStyle: {} },
              { name: 'Mutual of Omaha', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e1/Logo_of_Mutual_of_Omaha.svg/250px-Logo_of_Mutual_of_Omaha.svg.png', textStyle: {} },
              { name: 'AuguStar Financial', logo: null, textStyle: { fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.04em', lineHeight: 1.3 } },
              { name: 'SILAC', logo: null, textStyle: { fontWeight: 700, letterSpacing: '0.2em', fontSize: '1rem', border: '1.5px solid currentColor', padding: '4px 8px' } },
              { name: 'Prudential', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7e/Prudential_Financial.svg/250px-Prudential_Financial.svg.png', textStyle: {} },
              { name: 'John Hancock', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/56/John_Hancock_Insurance_Logo.svg', textStyle: {} },
              { name: 'Banner Life', logo: 'https://www.bannerlife.com/images/default-source/logos/banner-life-william-penn-color.png?sfvrsn=f7531d89_1', textStyle: {} },
              { name: 'Ameritas', logo: null, textStyle: { fontWeight: 500, fontSize: '1rem', fontStyle: 'italic', letterSpacing: '0.02em' } },
              { name: 'Foresters Financial', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Foresters_Financial_Logo.svg/250px-Foresters_Financial_Logo.svg.png', textStyle: {} },
              { name: 'BMI', logo: null, textStyle: { fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.08em' } },
              { name: 'Securian Financial', logo: 'https://assetlibrary.securian.com/content/dam/securian/content-assets/cse/sf-logo-rgb-bk-wordmark.svg', textStyle: {} },
              { name: 'Nassau', logo: null, textStyle: { fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.12em' } },
              { name: 'OneAmerica Financial', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Oneamericalogo.jpg/250px-Oneamericalogo.jpg', textStyle: {} },
              { name: 'American National', logo: 'https://americannational.com/content/dam/anico/brand/logos/AN_Logo_Stacked_2color.svg', textStyle: {} },
              { name: 'Allianz', logo: '/brand/allianz.svg', textStyle: {} },
              { name: 'F&G Annuities & Life', logo: '/brand/fg-annuities.svg', textStyle: {} },
            ].map(carrier => (
              <div
                key={carrier.name}
                className="flex items-center justify-center p-3"
                style={{
                  filter: 'grayscale(100%) opacity(0.55)',
                  transition: 'filter 0.3s ease',
                  minHeight: 64,
                  cursor: 'default',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.filter = 'grayscale(0%) opacity(1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.filter = 'grayscale(100%) opacity(0.55)' }}
              >
                {carrier.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={carrier.logo}
                    alt={carrier.name}
                    style={{ maxHeight: 44, maxWidth: '100%', width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{
                    color: '#1B3A5C',
                    fontFamily: "'DM Sans', sans-serif",
                    textAlign: 'center' as const,
                    display: 'block',
                    ...carrier.textStyle,
                  }}>
                    {carrier.name}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="divider-gold mt-10" />
          <p className="text-center mt-4 text-xs tracking-widest uppercase" style={{ color: 'rgba(107,130,153,0.5)' }}>
            Products and availability vary by state &middot; Licensed agents available upon request
          </p>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <section className="bg-navy-grad py-10 md:py-14 px-5 md:px-8">
        <div className="text-center mb-8">
          <span className="section-label">Why Families Trust Us</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center max-w-3xl mx-auto">
          {[
            { num: '55+', label: 'Years of Experience' },
            { num: '500+', label: 'Families Served' },
            { num: '100M', label: 'Family Goal' },
            { num: '5★', label: 'Client Rating' },
          ].map(stat => (
            <div key={stat.label}>
              <div className="font-serif text-3xl font-light text-white">{stat.num}</div>
              <div className="text-xs mt-1 tracking-wide" style={{ color: 'rgba(201,169,110,0.85)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="divider-gold mt-10 max-w-2xl mx-auto" />
        <p className="text-center mt-6 text-xs tracking-widest uppercase" style={{ color: 'rgba(235,244,255,0.4)' }}>
          Licensed &middot; Trusted &middot; Independent
        </p>
      </section>

      <CTABanner heading="Ready to take control of your financial future?" />
      <Footer />
    </main>
  )
}
