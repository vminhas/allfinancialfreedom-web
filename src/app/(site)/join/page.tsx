'use client'

import { useState } from 'react'
import Footer from '@/components/Footer'

// ─── Income Streams ───────────────────────────────────────────────────────────
const incomeStreams = [
  {
    title: 'Personal Commissions',
    desc: 'Earn competitive commissions on every policy and financial plan you implement for clients. Your contract level increases as your production grows.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    title: 'Residuals & Renewals',
    desc: 'Certain products generate recurring income year over year. Build a book of business that pays you whether you are actively working that day or not.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
      </svg>
    ),
  },
  {
    title: 'Agency Overrides',
    desc: 'As a licensed agency owner, you earn overrides on the production of agents within your organization. Your income scales with the team you develop.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    title: 'Performance Bonuses',
    desc: 'Carrier and agency bonuses are available for agents who hit production milestones. These are earned on top of your base commission structure.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" stroke="currentColor" fill="none" strokeWidth="1.5">
        <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </svg>
    ),
  },
]

// ─── Partnership Pathways ──────────────────────────────────────────────────────
const pathways = [
  {
    label: 'Part-Time Professional',
    desc: 'Keep your current career while building your licensed practice on the side. Many of our agents begin here and transition as their income grows.',
    ideal: 'Ideal for: those exploring, transitioning careers, or supplementing income',
  },
  {
    label: 'Full-Time Agent',
    desc: 'Commit fully to building your client base and practice. With mentorship, training, and carrier backing in place, this is a proven path to a professional financial services career.',
    ideal: 'Ideal for: career changers, driven self-starters, experienced professionals',
  },
  {
    label: 'Agency Owner',
    desc: 'The highest level of our platform. License your own brand, develop your own agents, and build an organization that generates agency override income and long-term equity.',
    ideal: 'Ideal for: leaders, entrepreneurs, and experienced licensed professionals',
  },
]

// ─── Differentiators ──────────────────────────────────────────────────────────
const differences = [
  {
    title: 'Real Ownership',
    desc: 'You own your book of business. We do not take it back. Build equity in a client base that belongs to you.',
  },
  {
    title: 'Independent Contracts',
    desc: 'You are contracted directly with the carriers, not through a middleman. That means better payout rates and more product options for your clients.',
  },
  {
    title: 'No Captive Restrictions',
    desc: 'Access to 50+ top-rated carriers means you can always place your client with the best solution, not just what one company offers.',
  },
  {
    title: 'Mentorship-Driven',
    desc: 'You are in business for yourself, but not by yourself. Every agent has access to a mentor who has already built what you are building.',
  },
  {
    title: 'Full Licensing Support',
    desc: 'We walk you through the state licensing process from start to finish. Most people complete it in 2-4 weeks with our support.',
  },
  {
    title: 'Remote & Flexible',
    desc: 'Work from anywhere. Our systems, tools, and training are fully remote-capable so your business fits your life.',
  },
]

// ─── Steps ────────────────────────────────────────────────────────────────────
const steps = [
  { num: '01', title: 'Submit Your Request', desc: 'Fill out the short form below so we can learn about your background and goals.' },
  { num: '02', title: 'Explore the Model', desc: 'We schedule a no-pressure call to walk you through the business model and answer every question you have.' },
  { num: '03', title: 'Meet the Team', desc: 'If it is a fit on both sides, we introduce you to the team, begin the licensing process, and set your first 30 days in motion.' },
]

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const faqs = [
  {
    q: 'Do I need prior experience in finance or insurance?',
    a: 'No prior experience is required. Our agents come from education, healthcare, sales, and countless other backgrounds. We provide the training. What we look for is coachability, integrity, and a genuine desire to help people.',
  },
  {
    q: 'Is this full-time or part-time?',
    a: 'Both options are available. Many professionals begin part-time while keeping their current position. The path is yours to define.',
  },
  {
    q: 'How does the licensing process work?',
    a: 'A state life and health insurance license is required to practice. We provide study resources, exam guidance, and direct support through the process. Most candidates complete it within 2-4 weeks.',
  },
  {
    q: 'How is income earned?',
    a: 'Income is earned through commissions on financial products and insurance policies placed for clients. Agency owners also earn overrides on the production of agents in their organization. This is a performance-based business model. Individual results will vary.',
  },
  {
    q: 'Who backs All Financial Freedom?',
    a: 'All Financial Freedom operates within one of North America\'s leading life insurance marketing organizations. This gives our agents access to carrier relationships, compliance infrastructure, and resources that would otherwise take years to build independently.',
  },
  {
    q: 'Is this a multi-level marketing company?',
    a: 'No. All Financial Freedom is a licensed insurance and financial services agency. Agents earn income from client transactions, not from recruiting. Agency overrides are a standard industry compensation structure paid by carriers, not by other agents.',
  },
]

// ─── Application Form ─────────────────────────────────────────────────────────
function ApplicationForm() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', licensed: '', pathway: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setStatus(res.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', fontSize: '0.875rem',
    border: '1px solid rgba(107,130,153,0.25)', borderRadius: 3,
    color: '#1A2B3C', background: '#fff', outline: 'none',
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' as const,
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.65rem', letterSpacing: '0.12em',
    textTransform: 'uppercase', color: '#6B8299', marginBottom: '0.4rem', fontWeight: 500,
  }

  if (status === 'success') return (
    <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#C9A96E' }}>✓</div>
      <h3 className="font-serif text-2xl text-navy mb-3">Request Received</h3>
      <p className="text-sm text-muted-blue leading-relaxed">
        We review every request personally. Expect to hear from us within 24-48 hours to schedule your introductory call.
      </p>
    </div>
  )

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={labelStyle}>First Name *</label>
          <input required style={inputStyle} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="First name" />
        </div>
        <div>
          <label style={labelStyle}>Last Name *</label>
          <input required style={inputStyle} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Last name" />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Email *</label>
        <input required type="email" style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} placeholder="your@email.com" />
      </div>
      <div>
        <label style={labelStyle}>Phone *</label>
        <input required type="tel" style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
      </div>
      <div>
        <label style={labelStyle}>Are you currently licensed?</label>
        <select style={{ ...inputStyle, color: form.licensed ? '#1A2B3C' : 'rgba(107,130,153,0.6)' }} value={form.licensed} onChange={e => set('licensed', e.target.value)}>
          <option value="">Select one</option>
          <option value="yes">Yes, I am licensed</option>
          <option value="in-progress">In progress</option>
          <option value="no">Not yet</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Which path interests you most?</label>
        <select style={{ ...inputStyle, color: form.pathway ? '#1A2B3C' : 'rgba(107,130,153,0.6)' }} value={form.pathway} onChange={e => set('pathway', e.target.value)}>
          <option value="">Select one</option>
          <option value="part-time">Part-Time Professional</option>
          <option value="full-time">Full-Time Agent</option>
          <option value="agency-owner">Agency Owner</option>
          <option value="unsure">Not sure yet</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Tell us about yourself and what you are looking for</label>
        <textarea rows={4} style={{ ...inputStyle, resize: 'vertical' }} value={form.message} onChange={e => set('message', e.target.value)} placeholder="Background, goals, questions..." />
      </div>
      {status === 'error' && <p style={{ color: '#c0392b', fontSize: '0.8rem' }}>Something went wrong. Please email contact@allfinancialfreedom.com</p>}
      <button type="submit" disabled={status === 'sending'} className="btn-gold" style={{ opacity: status === 'sending' ? 0.7 : 1 }}>
        {status === 'sending' ? 'Submitting...' : 'Submit Request'}
      </button>
      <p style={{ fontSize: '0.65rem', color: '#9BB0C4', textAlign: 'center', lineHeight: 1.6 }}>
        We review every request personally and respond within 24-48 hours. This is not an employment offer. All agents are independent contractors.
      </p>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function JoinPage() {
  return (
    <main className="pt-20">

      {/* HERO */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-2xl">
          <span className="section-label">The AFF Business Platform</span>
          <h1 className="section-title-light mb-5">
            Real business ownership.<br /><em>Built to last.</em>
          </h1>
          <p className="rich-text-light max-w-xl mb-8">
            All Financial Freedom is not a job. It is a licensed financial services business platform with the training, carrier access, mentorship, and infrastructure to help you build something you can be proud of and pass on.
          </p>
          <div className="flex flex-wrap gap-4">
            <a href="#request" className="btn-gold">Get Started</a>
            <a href="#pathways" className="btn-ghost">Explore Pathways</a>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="px-5 md:px-12 lg:px-20 py-5" style={{ background: '#0E2035', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
        <div className="flex flex-wrap gap-8 justify-center md:justify-start">
          {[
            { num: '50+', label: 'Top-Rated Carriers' },
            { num: '500+', label: 'Families Served' },
            { num: '55+', label: 'Years of Experience' },
            { num: '100%', label: 'Remote-Capable' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="font-serif text-xl font-light text-white">{s.num}</div>
              <div className="text-xs tracking-widest uppercase" style={{ color: 'rgba(201,169,110,0.7)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* THE AFF DIFFERENCE */}
      <section className="page-section bg-sky" id="difference">
        <div className="text-center mb-14">
          <span className="section-label">The AFF Difference</span>
          <h2 className="section-title">Why this platform is<br /><em>built differently.</em></h2>
          <p className="rich-text max-w-2xl mx-auto mt-4">
            Most financial services opportunities come with restrictions. We built ours around ownership, independence, and results for the client and the agent.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {differences.map(d => (
            <div key={d.title} className="card-premium p-7">
              <span className="gold-rule" />
              <h3 className="font-serif text-lg text-navy mb-2">{d.title}</h3>
              <p className="text-sm leading-relaxed text-muted-blue">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* DIVERSIFY YOUR INCOME */}
      <section className="page-section bg-white-section" id="income">
        <div className="text-center mb-14">
          <span className="section-label">Income Structure</span>
          <h2 className="section-title">Multiple ways to<br /><em>earn and grow.</em></h2>
          <p className="rich-text max-w-2xl mx-auto mt-4">
            The AFF platform is designed for diversified income, not dependence on a single stream. Each layer builds on the one before it.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {incomeStreams.map(s => (
            <div key={s.title} className="card-premium p-8 flex gap-5">
              <div className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg, #1B3A5C, #2A5280)' }}>
                {s.icon}
              </div>
              <div>
                <span className="gold-rule" />
                <h3 className="font-serif text-lg text-navy mb-2">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-blue">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs mt-8 max-w-2xl mx-auto" style={{ color: '#9BB0C4', lineHeight: 1.7 }}>
          This is a performance-based independent contractor model. Income is not guaranteed and will vary based on individual effort, production, market conditions, and licensing status. Agency override income is a standard industry structure paid through carrier contracts.
        </p>
      </section>

      {/* PARTNERSHIP PATHWAYS */}
      <section className="page-section bg-navy-grad" id="pathways">
        <div className="text-center mb-14">
          <span className="section-label">Partnership Pathways</span>
          <h2 className="section-title-light">Find the path<br /><em>that fits your life.</em></h2>
          <p className="rich-text-light max-w-2xl mx-auto mt-4">
            There is no single way to build with us. Whether you are exploring, transitioning, or ready to go all in, there is a starting point for you.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {pathways.map((p, i) => (
            <div key={p.label} className="p-8 rounded-sm flex flex-col" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,169,110,0.2)' }}>
              <div className="font-serif text-4xl font-light mb-4" style={{ color: 'rgba(201,169,110,0.25)', lineHeight: 1 }}>
                0{i + 1}
              </div>
              <span className="gold-rule" />
              <h3 className="font-serif text-xl text-white mb-3">{p.label}</h3>
              <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(235,244,255,0.6)', flexGrow: 1 }}>{p.desc}</p>
              <p className="text-xs" style={{ color: 'rgba(201,169,110,0.6)', fontStyle: 'italic' }}>{p.ideal}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="page-section bg-sky" id="how-it-works">
        <div className="text-center mb-14">
          <span className="section-label">Getting Started</span>
          <h2 className="section-title">Three steps to<br /><em>exploring this opportunity.</em></h2>
        </div>
        <div className="grid md:grid-cols-3 gap-10 max-w-4xl mx-auto">
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

      {/* COMMUNITY QUOTE */}
      <section className="page-section bg-white-section">
        <div className="max-w-3xl mx-auto text-center">
          <div className="font-serif text-5xl font-light mb-6" style={{ color: 'rgba(201,169,110,0.3)', lineHeight: 1 }}>"</div>
          <blockquote className="font-serif text-2xl md:text-3xl font-light text-navy leading-relaxed mb-6">
            You are in business for yourself, but never by yourself.
          </blockquote>
          <p className="text-sm tracking-widest uppercase" style={{ color: '#C9A96E' }}>The All Financial Freedom Way</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="page-section bg-sky">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="section-label">Common Questions</span>
            <h2 className="section-title">Answers before<br /><em>you apply.</em></h2>
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

      {/* REQUEST FORM */}
      <section className="page-section bg-navy-grad" id="request">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <span className="section-label">Get Started</span>
          <h2 className="section-title-light mb-4">Ready to explore<br /><em>the opportunity?</em></h2>
          <p className="rich-text-light">
            Submit a request and a member of our leadership team will reach out personally to schedule your introductory call. No pressure, no obligation.
          </p>
        </div>
        <div className="max-w-2xl mx-auto">
          <div className="rounded-sm p-8" style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(201,169,110,0.2)' }}>
            <ApplicationForm />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
