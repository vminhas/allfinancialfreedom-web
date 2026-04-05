'use client'

import type { Metadata } from 'next'
import Link from 'next/link'
import { GHL_FORM_EMBED_SRC } from '@/lib/constants'
import Script from 'next/script'
import Footer from '@/components/Footer'

const pillarIcons: Record<string, React.ReactNode> = {
  training: (
    <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
      <path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
    </svg>
  ),
  income: (
    <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  backing: (
    <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
}

const pillars = [
  {
    iconKey: 'training',
    title: 'World-Class Training',
    desc: 'From day one, you have access to a proven training system, licensing support, and a mentorship structure built by people who\'ve done it themselves.',
  },
  {
    iconKey: 'income',
    title: 'Unlimited Income',
    desc: 'This is a performance-based business. There\'s no ceiling. Associates who follow the system consistently build six-figure income within 12–18 months.',
  },
  {
    iconKey: 'backing',
    title: 'Professional Backing',
    desc: 'You\'re not starting from scratch. You\'re backed by one of North America\'s largest life insurance marketing organizations with carrier relationships, compliance support, and infrastructure already in place.',
  },
  {
    iconKey: 'team',
    title: 'Build Your Own Team',
    desc: 'The ultimate goal: build your own licensed team, create your own brand, and generate residual income from your people. We\'ll show you exactly how.',
  },
]

const steps = [
  { num: '01', title: 'Apply', desc: 'Fill out the form below. Tell us a little about yourself and what drives you.' },
  { num: '02', title: 'Discovery Call', desc: 'We\'ll schedule a 30-minute call to answer your questions and see if we\'re a fit.' },
  { num: '03', title: 'Get Licensed', desc: 'We walk you through the licensing process — fully supported, typically completed in 2–4 weeks.' },
  { num: '04', title: 'Start Building', desc: 'Join the team, complete onboarding, and start your first week with a clear action plan.' },
]

const faqs = [
  {
    q: 'Do I need experience in finance or insurance?',
    a: 'No. Our top performers come from all backgrounds — teachers, nurses, sales professionals, stay-at-home parents. We provide full training. What we look for is coachability, work ethic, and a genuine desire to help people.',
  },
  {
    q: 'Is this full-time or can I start part-time?',
    a: 'Many people start part-time while keeping their current job. Once your income replaces your salary, you transition full-time. We work with your schedule.',
  },
  {
    q: 'How does the licensing process work?',
    a: 'You\'ll need a state life and health insurance license. We provide study materials, coaching, and connect you with the exam process. Most people complete licensing in 2–4 weeks.',
  },
  {
    q: 'How do I make money?',
    a: 'You earn commissions on insurance policies and financial products you help clients implement. As you build a team, you also earn overrides on their production. There are no quotas or salary caps.',
  },
  {
    q: 'Who backs All Financial Freedom?',
    a: 'All Financial Freedom operates under one of North America\'s leading life insurance marketing organizations, which provides carrier contracts, compliance support, and infrastructure. You benefit from that backing while building your own brand.',
  },
]

export default function JoinPage() {
  return (
    <main className="pt-20">
      <Script src={GHL_FORM_EMBED_SRC} strategy="lazyOnload" />

      {/* HERO */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-2xl">
          <span className="section-label">Join All Financial Freedom</span>
          <h1 className="section-title-light mb-5">
            Build your own<br /><em>financial legacy.</em>
          </h1>
          <p className="rich-text-light max-w-lg mb-8">
            This isn&apos;t a job. It&apos;s a business — with training, mentorship, professional backing, and a clear path to building your own licensed team.
          </p>
          <div className="flex gap-4">
            <a href="#apply" className="btn-gold">Apply Now</a>
            <a href="#how-it-works" className="btn-ghost">How It Works</a>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF BAR */}
      <section className="px-5 md:px-12 lg:px-20 py-5" style={{ background: '#0E2035', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
        <div className="flex flex-wrap gap-8 justify-center md:justify-start">
          {[
            { num: '500+', label: 'Families Helped' },
            { num: '55+', label: 'Years of Experience' },
            { num: '✓', label: 'Backed & Licensed' },
            { num: '100%', label: 'Remote-Capable' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="font-serif text-xl font-light text-white">{s.num}</div>
              <div className="text-xs tracking-widest uppercase" style={{ color: 'rgba(201,169,110,0.7)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY JOIN */}
      <section className="page-section bg-sky" id="why-join">
        <div className="text-center mb-14">
          <span className="section-label">Why All Financial Freedom</span>
          <h2 className="section-title">Everything you need to<br /><em>build something real.</em></h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {pillars.map(p => (
            <div key={p.title} className="card-premium p-8">
              <div className="w-12 h-12 mb-5 flex items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg, #1B3A5C, #2A5280)' }}>
                {pillarIcons[p.iconKey]}
              </div>
              <span className="gold-rule" />
              <h3 className="font-serif text-xl text-navy mb-2">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-blue">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="page-section bg-white-section" id="how-it-works">
        <div className="text-center mb-14">
          <span className="section-label">The Process</span>
          <h2 className="section-title">From application<br /><em>to building your team.</em></h2>
        </div>
        <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {steps.map((step, i) => (
            <div key={step.num} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-6 right-0 w-8 h-px"
                  style={{ background: 'rgba(201,169,110,0.3)', transform: 'translateX(100%)' }} />
              )}
              <div className="font-serif font-light mb-3" style={{ fontSize: '3rem', color: 'rgba(201,169,110,0.2)', lineHeight: 1 }}>
                {step.num}
              </div>
              <span className="gold-rule" />
              <h3 className="font-serif text-lg text-navy mb-2">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-blue">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* INCOME POTENTIAL */}
      <section className="page-section bg-navy-grad">
        <div className="grid md:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
          <div>
            <span className="section-label">Income Potential</span>
            <h2 className="section-title-light mb-6">
              What can you actually<br /><em>earn here?</em>
            </h2>
            <p className="rich-text-light mb-4">
              Your income is tied directly to the value you create for clients and the team you build. There&apos;s no ceiling — but also no guarantees. This is a business, and it rewards effort.
            </p>
            <p className="rich-text-light mb-8">
              Here&apos;s what the typical journey looks like for agents who follow the system:
            </p>
            <Link href="#apply" className="btn-gold">See If You Qualify</Link>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {[
              { range: '$30K – $60K', period: 'Year 1 (part-time to full-time transition)', note: 'Building your client base and getting licensed' },
              { range: '$60K – $120K', period: 'Year 2 (full-time, building a team)', note: 'Commissions + team overrides beginning' },
              { range: '$150K+', period: 'Year 3+ (established team leader)', note: 'Residual income from your team\'s production' },
            ].map(tier => (
              <div key={tier.range} className="p-5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4 }}>
                <div className="font-serif text-2xl font-light text-white mb-1">{tier.range}</div>
                <div className="text-xs tracking-wide mb-1" style={{ color: '#C9A96E' }}>{tier.period}</div>
                <div className="text-xs" style={{ color: 'rgba(235,244,255,0.45)' }}>{tier.note}</div>
              </div>
            ))}
            <p className="text-xs mt-2" style={{ color: 'rgba(235,244,255,0.25)' }}>
              Income ranges are illustrative based on representative agent performance. Individual results vary based on effort, market, and licensing.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="page-section bg-sky">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="section-label">Common Questions</span>
            <h2 className="section-title">Everything you need to know<br /><em>before applying.</em></h2>
          </div>
          <div className="space-y-4">
            {faqs.map(faq => (
              <div key={faq.q} className="card-premium p-6">
                <h3 className="font-serif text-lg text-navy mb-2">{faq.q}</h3>
                <p className="text-sm leading-relaxed text-muted-blue">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APPLICATION FORM */}
      <section className="page-section bg-white-section" id="apply">
        <div className="max-w-2xl mx-auto text-center">
          <span className="section-label">Apply Now</span>
          <h2 className="section-title mb-4">Ready to take the first step?</h2>
          <p className="rich-text mb-10">
            Fill out the form below. We review every application personally and will reach out within 24–48 hours to schedule your discovery call.
          </p>
        </div>
        <div className="max-w-2xl mx-auto">
          <div className="card-premium p-8">
            {/* GHL Form Embed — replace the data-form attribute with your GHL join form ID */}
            <div
              className="ghl-form"
              data-form="join-team-form"
              style={{ minHeight: 400 }}
            >
              {/* Placeholder until GHL join form is configured */}
              <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                <p style={{ color: '#6B8299', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Application form loading… If it doesn&apos;t appear, please email us directly.
                </p>
                <a href="mailto:contact@allfinancialfreedom.com?subject=Join the Team — Application"
                  className="btn-gold">
                  Apply via Email
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
