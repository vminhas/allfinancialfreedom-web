import type { Metadata } from 'next'
import Image from 'next/image'
import { TEAM, ASSOCIATES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Team — All Financial Freedom',
  description: 'Meet the mission-driven leaders, educators, and entrepreneurs behind All Financial Freedom.',
}

export default function Team() {
  return (
    <main className="pt-20">
      {/* Page Hero */}
      <section className="page-section" style={{ background: '#161616', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
        <p className="section-label">Our People</p>
        <h1 className="section-title">Driven by purpose.<br /><em>United by impact.</em></h1>
        <p className="text-muted mt-4 max-w-lg leading-relaxed">
          We come from diverse backgrounds, but share one goal: transforming lives through financial empowerment.
        </p>
      </section>

      {/* Mission Statement */}
      <section className="page-section" style={{ background: '#1E1E1E' }}>
        <p className="rich-text max-w-4xl text-base" style={{ lineHeight: '1.9' }}>
          At All Financial Freedom, our team is more than a group of professionals — we&apos;re a movement of mission-driven leaders, educators, and entrepreneurs who are passionate about transforming lives through financial empowerment. Each member brings unique strengths, whether expert financial knowledge, leadership experience, or the heart of a coach. What unites us is a commitment to mentorship, collaboration, and impact. We&apos;re not just building careers… <strong className="text-cream">we&apos;re building futures.</strong>
        </p>
      </section>

      {/* Leadership */}
      <section className="page-section" style={{ background: '#0D0D0D' }}>
        <p className="section-label">Agency Owners</p>
        <h2 className="section-title mb-16"><em>Leadership</em> you can trust.</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {TEAM.map((member) => (
            <div key={member.name} className="group">
              <div className="relative overflow-hidden rounded-sm mb-5" style={{ aspectRatio: '3/4', background: '#1E1E1E' }}>
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <h3 className="font-serif text-2xl text-cream">{member.name}</h3>
              <p className="text-gold text-xs tracking-widest uppercase mt-1 mb-3">
                {member.title}{member.credentials ? ` · ${member.credentials}` : ''}
              </p>
              <p className="text-sm text-muted leading-relaxed">{member.bio}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Senior Associates */}
      <section className="page-section" style={{ background: '#161616' }}>
        <p className="section-label">The Team</p>
        <h2 className="section-title mb-12"><em>Senior Associates</em></h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {ASSOCIATES.map((assoc) => (
            <div
              key={assoc.name}
              className="text-center p-5 rounded-sm"
              style={{ background: '#1E1E1E', border: '1px solid rgba(201,169,110,0.1)' }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 font-serif text-lg text-gold"
                style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)' }}
              >
                {assoc.initials}
              </div>
              <div className="text-sm text-cream">{assoc.name}</div>
              <div className="text-xs text-muted mt-1">Senior Associate</div>
            </div>
          ))}
        </div>
      </section>

      <CTABanner heading="Want to join the movement?" buttonText="Start the Conversation" />
      <Footer />
    </main>
  )
}
