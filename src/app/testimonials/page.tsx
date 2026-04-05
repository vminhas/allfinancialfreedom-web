import type { Metadata } from 'next'
import { TESTIMONIALS } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Client Stories | All Financial Freedom',
  description: 'Hear from the individuals and families whose financial lives have been transformed.',
}

export default function Testimonials() {
  return (
    <main className="pt-20">

      {/* HERO */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-2xl">
          <span className="section-label">Client Stories</span>
          <h1 className="section-title-light mb-5">
            Real people.<br /><em>Real results.</em>
          </h1>
          <p className="rich-text-light max-w-lg">
            Hear from the individuals and families whose financial lives have been transformed.
          </p>
        </div>
      </section>

      {/* TESTIMONIALS GRID */}
      <section className="page-section bg-white-section">
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="card-premium p-8 relative flex flex-col">
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} viewBox="0 0 12 12" className="w-3 h-3" fill="#C9A96E">
                    <path d="M6 0l1.5 3.5 3.5.5-2.5 2.5.5 3.5L6 8.5l-3 1.5.5-3.5L1 4l3.5-.5z"/>
                  </svg>
                ))}
              </div>
              {/* Large quote mark */}
              <div className="absolute top-5 right-6 font-serif text-6xl font-light leading-none pointer-events-none select-none"
                style={{ color: 'rgba(201,169,110,0.1)' }}>&ldquo;</div>
              {/* Quote text */}
              <p className="text-sm flex-1 mb-6 text-muted-blue" style={{ lineHeight: 1.85 }}>{t.text}</p>
              {/* Attribution */}
              <div className="flex items-center gap-3" style={{ borderTop: '1px solid rgba(201,169,110,0.12)', paddingTop: '1.25rem' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #1B3A5C, #2A5280)', color: '#C9A96E' }}>
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

      {/* LEAVE A REVIEW */}
      <section className="page-section bg-sky">
        <div className="max-w-2xl mx-auto text-center">
          <span className="section-label">Leave a Review</span>
          <h2 className="section-title mb-4">Had a great experience?<br /><em>We would love to hear it.</em></h2>
          <p className="rich-text mb-8">Your story could inspire someone else to take control of their financial future.</p>
          <a href="mailto:contact@allfinancialfreedom.com?subject=My Experience with All Financial Freedom" className="btn-gold">
            Share Your Story
          </a>
        </div>
      </section>

      <CTABanner heading="Your story could be next." />
      <Footer />
    </main>
  )
}
