import type { Metadata } from 'next'
import { SERVICES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Services — All Financial Freedom',
  description: 'Explore our full range of financial services including wealth building, asset protection, insurance, retirement, and legacy planning.',
}

const icons: Record<string, React.ReactNode> = {
  layers: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
  shield: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  'check-square': <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  'dollar-sign': <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  clock: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  users: <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
}

export default function Services() {
  return (
    <main className="pt-20">
      {/* Page Hero */}
      <section className="page-section" style={{ background: '#161616', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
        <p className="section-label">What We Offer</p>
        <h1 className="section-title">Comprehensive strategies for<br /><em>every chapter</em> of your life.</h1>
        <p className="text-muted mt-4 max-w-lg leading-relaxed">
          From your first budget to your lasting legacy — we&apos;re with you at every step.
        </p>
      </section>

      {/* Services Grid */}
      <section className="page-section" style={{ background: '#0D0D0D' }}>
        <div className="grid md:grid-cols-3 gap-px" style={{ background: 'rgba(201,169,110,0.1)' }}>
          {SERVICES.map((service) => (
            <div
              key={service.title}
              className="p-10 transition-colors duration-300"
              style={{ background: '#161616' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#1E1E1E')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#161616')}
            >
              <div
                className="w-14 h-14 flex items-center justify-center text-gold rounded-sm mb-6"
                style={{ border: '1px solid rgba(201,169,110,0.3)' }}
              >
                {icons[service.icon]}
              </div>
              <h2 className="font-serif text-2xl text-cream mb-3">{service.title}</h2>
              <p className="text-sm text-muted leading-relaxed mb-6">{service.description}</p>
              <ul className="space-y-2">
                {service.bullets.map((bullet) => (
                  <li key={bullet} className="text-xs text-muted py-2" style={{ borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
                    <span className="text-gold mr-2">·</span>{bullet}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <CTABanner heading="Not sure where to start? Let's figure it out together." />
      <Footer />
    </main>
  )
}
