'use client'

import Image from 'next/image'
import Link from 'next/link'
import { IMAGES, SERVICES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

const serviceIcons: Record<string, React.ReactNode> = {
  layers: <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
  shield: <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  'check-square': <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  'dollar-sign': <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" fill="none" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  clock: <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" fill="none" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  users: <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
}

export default function Home() {
  const openBooking = () => window.dispatchEvent(new CustomEvent('open-booking'))

  return (
    <main>
      {/* HERO */}
      <section className="relative flex items-center" style={{ height: '100vh', minHeight: '640px' }}>
        <div className="absolute inset-0">
          <Image src={IMAGES.heroBg} alt="Mountain landscape" fill className="object-cover" priority />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(105deg, rgba(13,13,13,0.88) 45%, rgba(13,13,13,0.3) 100%)' }} />
        </div>
        <div className="relative z-10 px-16 max-w-3xl">
          <p className="section-label animate-[fadeUp_0.8s_0.2s_both]">All Financial Freedom</p>
          <h1 className="font-serif font-light text-cream mb-7 animate-[fadeUp_0.8s_0.4s_both]"
            style={{ fontSize: 'clamp(2.8rem, 5.5vw, 5rem)', lineHeight: 1.08 }}>
            It&apos;s not just about money —<br />
            it&apos;s about building a future<br />
            you feel <em className="italic text-gold">confident</em> in.
          </h1>
          <p className="text-cream/70 mb-10 max-w-md leading-relaxed animate-[fadeUp_0.8s_0.6s_both]">
            Personalized strategies for wealth-building, protection, and legacy — designed for real people, from every background.
          </p>
          <div className="flex gap-5 flex-wrap animate-[fadeUp_0.8s_0.8s_both]">
            <Link href="/services" className="btn-primary">Our Services</Link>
            <Link href="/about" className="btn-ghost">Learn More</Link>
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section className="page-section" style={{ background: '#161616' }}>
        <p className="section-label">Our Mission</p>
        <h2 className="section-title mb-16">
          We believe everyone deserves access to<br />
          <em>clear, empowering</em> financial guidance.
        </h2>
        <div className="grid md:grid-cols-3 divide-x divide-gold/15">
          {[
            { num: '01', title: 'What We Stand For', text: 'We believe everyone deserves access to clear, empowering financial guidance — no matter their background, income, or starting point.' },
            { num: '02', title: 'What We Do', text: 'We offer personalized strategies in wealth-building, protection, insurance, budgeting, and planning — designed to help individuals, families, and businesses create lasting financial freedom.' },
            { num: '03', title: 'Why It Matters', text: 'Because real freedom starts with financial confidence, and we\'re here to make that possible — one empowered client at a time.' },
          ].map((card) => (
            <div key={card.num} className="px-8 py-2 first:pl-0">
              <div className="font-serif text-6xl font-light mb-4" style={{ color: 'rgba(201,169,110,0.12)' }}>{card.num}</div>
              <h3 className="font-serif text-xl text-gold mb-3">{card.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PHOTO STRIP */}
      <div className="grid md:grid-cols-3" style={{ height: '420px' }}>
        {[
          { src: IMAGES.strip1, label: 'Personalized Planning' },
          { src: IMAGES.strip2, label: 'Family Guidance' },
          { src: IMAGES.strip3, label: 'Lasting Wealth' },
        ].map((item) => (
          <div key={item.label} className="relative overflow-hidden group">
            <Image src={item.src} alt={item.label} fill className="object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 60%, rgba(13,13,13,0.7))' }} />
            <div className="absolute bottom-4 left-5">
              <span className="section-label">{item.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* WEALTH GAP */}
      <section className="page-section" style={{ background: '#1E1E1E' }}>
        <div className="grid md:grid-cols-2 gap-24 items-center">
          <div>
            <p className="section-label">Closing the Wealth Gap</p>
            <h2 className="section-title mb-6">A financial crossroads<br /><em>is here.</em></h2>
            <p className="rich-text">In a world of economic uncertainty and constant industry change, <strong>clarity is power.</strong> We&apos;re here to cut through the noise, spread real financial literacy, and create a clear path forward.</p>
            <p className="rich-text mt-4">As the baby boomer generation enters retirement, an estimated $68 trillion in wealth is expected to transfer to the next generation. Without proper financial guidance, decades of hard work could quickly erode.</p>
            <div className="flex gap-12 mt-8">
              <div>
                <div className="font-serif text-4xl font-light text-gold">$68T</div>
                <div className="text-xs text-muted mt-1">Wealth transfer underway</div>
              </div>
              <div>
                <div className="font-serif text-4xl font-light text-gold">100M</div>
                <div className="text-xs text-muted mt-1">Families we aim to empower</div>
              </div>
            </div>
            <div className="mt-8">
              <Link href="/about" className="btn-primary">Our Story</Link>
            </div>
          </div>
          <div className="relative">
            <Image src={IMAGES.wealthGap} alt="Financial empowerment" width={600} height={480} className="object-cover w-full rounded-sm" style={{ height: '480px' }} />
            <div className="absolute -top-5 -left-5 w-48 h-48 border border-gold/25 rounded-sm -z-10" />
          </div>
        </div>
      </section>

      <div className="gold-divider" />

      {/* SERVICES PREVIEW */}
      <section className="page-section" style={{ background: '#0D0D0D' }}>
        <p className="section-label">What We Offer</p>
        <h2 className="section-title mb-16">Comprehensive strategies for<br /><em>every stage</em> of your journey.</h2>
        <div className="grid md:grid-cols-3 gap-px" style={{ background: 'rgba(201,169,110,0.1)' }}>
          {SERVICES.map((s) => (
            <div key={s.title} className="p-10 transition-colors duration-300 hover:bg-dark-3" style={{ background: '#161616' }}>
              <div className="w-10 h-10 mb-5 flex items-center justify-center text-gold rounded-sm"
                style={{ border: '1px solid rgba(201,169,110,0.3)' }}>
                {serviceIcons[s.icon]}
              </div>
              <h3 className="font-serif text-xl text-cream mb-3">{s.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <Link href="/services" className="btn-primary">View All Services</Link>
        </div>
      </section>

      <CTABanner heading="Ready to take control of your financial future?" />
      <Footer />

      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  )
}
