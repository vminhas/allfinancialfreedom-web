import type { Metadata } from 'next'
import { TESTIMONIALS } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Testimonials — All Financial Freedom',
  description: 'Hear from the individuals and families whose financial lives have been transformed.',
}

export default function Testimonials() {
  return (
    <main className="pt-20">
      <section className="page-section" style={{ background: '#EBF4FF', borderBottom: '1px solid rgba(59,126,200,0.1)' }}>
        <p className="section-label">Client Stories</p>
        <h1 className="section-title">Real people.<br /><em>Real results.</em></h1>
        <p className="mt-4 max-w-lg leading-relaxed" style={{ color: '#6B8299' }}>
          Hear from the individuals and families whose financial lives have been transformed.
        </p>
      </section>

      <section className="page-section" style={{ background: 'white' }}>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="card p-8 relative">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-xs" style={{ color: '#3B7EC8' }}>★</span>
                ))}
              </div>
              <div className="absolute top-4 right-6 font-serif text-6xl font-light leading-none pointer-events-none"
                style={{ color: 'rgba(59,126,200,0.08)' }}>&ldquo;</div>
              <p className="text-sm leading-relaxed mb-6" style={{ color: '#4A6A8A', lineHeight: '1.8' }}>{t.text}</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm flex-shrink-0"
                  style={{ background: '#EBF4FF', color: '#3B7EC8' }}>
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: '#1B3A5C' }}>{t.name}</div>
                  <div className="text-xs" style={{ color: '#6B8299' }}>{t.meta}</div>
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
