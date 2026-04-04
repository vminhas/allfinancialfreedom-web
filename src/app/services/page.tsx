'use client'

import Link from 'next/link'
import { SERVICES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

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
      <section className="page-section bg-sky" style={{ borderBottom: '1px solid rgba(59,126,200,0.1)' }}>
        <span className="section-label">What We Offer</span>
        <h1 className="section-title">Comprehensive strategies for<br /><em>every chapter</em> of your life.</h1>
        <p className="mt-4 max-w-lg leading-relaxed text-muted-blue">
          From your first budget to your lasting legacy — we are with you at every step.
        </p>
      </section>

      <section className="page-section bg-white-section">
        <div className="grid md:grid-cols-3 gap-6">
          {SERVICES.map(service => (
            <div key={service.title} className="card p-8 transition-shadow hover:shadow-lg">
              <div className="w-14 h-14 flex items-center justify-center rounded-lg mb-6 text-blue" style={{ background: 'rgba(59,126,200,0.1)' }}>
                {icons[service.icon]}
              </div>
              <h2 className="font-serif text-2xl mb-3 text-navy">{service.title}</h2>
              <p className="text-sm leading-relaxed mb-5 text-muted-blue">{service.description}</p>
              <ul className="space-y-2">
                {service.bullets.map(bullet => (
                  <li key={bullet} className="text-xs text-muted-blue py-2" style={{ borderBottom: '1px solid rgba(59,126,200,0.1)' }}>
                    <span className="text-blue mr-2">·</span>{bullet}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="page-section bg-sky">
        <div className="max-w-2xl mx-auto text-center">
          <span className="section-label">How It Works</span>
          <h2 className="section-title mb-4">Simple steps to financial freedom</h2>
          <p className="rich-text mb-10">We meet you where you are and build a plan that grows with you.</p>
          <div className="grid md:grid-cols-3 gap-6 text-left">
            {[
              { step: '01', title: 'Book a Free Call', text: 'Start with a no-pressure conversation about your goals, situation, and what financial freedom means to you.' },
              { step: '02', title: 'Get Your Plan', text: 'We build a personalized strategy covering protection, growth, and legacy — tailored to your life.' },
              { step: '03', title: 'Build Your Future', text: 'With ongoing support and guidance, we help you execute the plan and stay on track toward your goals.' },
            ].map(step => (
              <div key={step.step} className="card p-6">
                <div className="font-serif text-4xl font-light mb-3" style={{ color: 'rgba(59,126,200,0.2)' }}>{step.step}</div>
                <h3 className="font-serif text-lg mb-2 text-navy">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-blue">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <button onClick={() => window.dispatchEvent(new CustomEvent('open-booking'))} className="btn-primary">Book Your Free Call</button>
          </div>
        </div>
      </section>

      <CTABanner heading="Not sure where to start? Let us figure it out together." />
      <Footer />
    </main>
  )
}
