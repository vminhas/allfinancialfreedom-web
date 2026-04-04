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
      <section className="page-section bg-sky" style={{ borderBottom: '1px solid rgba(59,126,200,0.1)' }}>
        <span className="section-label">Client Stories</span>
        <h1 className="section-title">Real people.<br /><em>Real results.</em></h1>
        <p className="mt-4 max-w-lg leading-relaxed text-muted-blue">
          Hear from the individuals and families whose financial lives have been transformed.
        </p>
      </section>

      <section className="page-section bg-white-section">
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="card p-8 relative">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => <span key={i} className="text-xs text-blue">★</span>)}
              </div>
              <div className="absolute top-4 right-6 font-serif text-6xl font-light leading-none pointer-events-none" style={{ color: 'rgba(59,126,200,0.08)' }}>&ldquo;</div>
              <p className="text-sm mb-6 text-muted-blue" style={{ lineHeight: 1.8 }}>{t.text}</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm flex-shrink-0 text-blue" style={{ background: '#EBF4FF' }}>
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-medium text-navy">{t.name}</div>
                  <div className="text-xs text-muted-blue">{t.meta}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="page-section bg-sky">
        <div className="max-w-2xl mx-auto text-center">
          <span className="section-label">Leave a Review</span>
          <h2 className="section-title mb-4">Had a great experience?<br /><em>We would love to hear it.</em></h2>
          <p className="rich-text mb-8">Your story could inspire someone else to take control of their financial future.</p>
          <a href="mailto:vick@allfinancialfreedom.com?subject=My Experience with All Financial Freedom" className="btn-primary">Share Your Story</a>
        </div>
      </section>

      <CTABanner heading="Your story could be next." />
      <Footer />
    </main>
  )
}
