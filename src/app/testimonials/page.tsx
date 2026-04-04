import type { Metadata } from 'next'
import { TESTIMONIALS } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Testimonials — All Financial Freedom',
  description: 'Hear from the individuals and families whose financial lives have been transformed by All Financial Freedom.',
}

export default function Testimonials() {
  return (
    <main className="pt-20">
      {/* Page Hero */}
      <section className="page-section" style={{ background: '#161616', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
        <p className="section-label">Client Stories</p>
        <h1 className="section-title">Real people.<br /><em>Real results.</em></h1>
        <p className="text-muted mt-4 max-w-lg leading-relaxed">
          Hear from the individuals and families whose financial lives have been transformed.
        </p>
      </section>

      {/* Testimonials */}
      <section className="page-section" style={{ background: '#0D0D0D' }}>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="relative p-8 rounded-sm"
              style={{ background: '#1E1E1E', border: '1px solid rgba(201,169,110,0.1)' }}
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-gold text-xs">★</span>
                ))}
              </div>

              {/* Quote mark */}
              <div
                className="absolute top-4 right-6 font-serif text-6xl font-light leading-none pointer-events-none"
                style={{ color: 'rgba(201,169,110,0.12)' }}
              >
                &ldquo;
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(240,237,232,0.8)', lineHeight: '1.8' }}>
                {t.text}
              </p>

              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm text-gold flex-shrink-0"
                  style={{ background: 'rgba(201,169,110,0.1)' }}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-medium text-cream">{t.name}</div>
                  <div className="text-xs text-muted">{t.meta}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <CTABanner heading="Your story could be next." />
      <Footer />
    </main>
  )
}
