import type { Metadata } from 'next'
import Image from 'next/image'
import { TEAM, ASSOCIATES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Team — All Financial Freedom',
  description: 'Meet the mission-driven leaders behind All Financial Freedom.',
}

export default function Team() {
  return (
    <main className="pt-20">
      <section className="page-section bg-sky" style={{ borderBottom: '1px solid rgba(59,126,200,0.1)' }}>
        <span className="section-label">Our People</span>
        <h1 className="section-title">Driven by purpose.<br /><em>United by impact.</em></h1>
        <p className="mt-4 max-w-lg leading-relaxed text-muted-blue">
          We come from diverse backgrounds, but share one goal: transforming lives through financial empowerment.
        </p>
      </section>

      <section className="page-section bg-white-section">
        <p className="rich-text max-w-4xl text-base" style={{ lineHeight: 1.9 }}>
          At All Financial Freedom, our team is more than a group of professionals — we are a movement of mission-driven leaders, educators, and entrepreneurs passionate about transforming lives through financial empowerment. What unites us is a commitment to mentorship, collaboration, and impact. We are not just building careers… <strong>we are building futures.</strong>
        </p>
      </section>

      <section className="page-section bg-sky">
        <span className="section-label">Agency Owners</span>
        <h2 className="section-title mb-12"><em>Leadership</em> you can trust.</h2>
        <div className="grid md:grid-cols-2 gap-12 max-w-4xl">
          {TEAM.map(member => (
            <div key={member.name} className="group">
              <div className="relative overflow-hidden rounded-lg mb-5" style={{ aspectRatio: '3/4' }}>
                <Image src={member.image} alt={member.name} fill className="object-cover object-top transition-transform duration-700 group-hover:scale-105" />
              </div>
              <h3 className="font-serif text-2xl text-navy">{member.name}</h3>
              <p className="text-xs tracking-widest uppercase mt-1 mb-3 font-medium text-blue">
                {member.title}{member.credentials ? ` · ${member.credentials}` : ''}
              </p>
              <p className="text-sm leading-relaxed text-muted-blue">{member.bio}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="page-section bg-white-section">
        <span className="section-label">The Team</span>
        <h2 className="section-title mb-10"><em>Senior Associates</em></h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {ASSOCIATES.map(assoc => (
            <div key={assoc.name} className="card text-center p-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 font-serif text-lg text-blue"
                style={{ background: 'rgba(59,126,200,0.1)', border: '1px solid rgba(59,126,200,0.2)' }}>
                {assoc.initials}
              </div>
              <div className="text-sm font-medium text-navy">{assoc.name}</div>
              <div className="text-xs mt-1 text-muted-blue">Senior Associate</div>
            </div>
          ))}
        </div>
      </section>

      <CTABanner heading="Want to join the movement?" buttonText="Start the Conversation" />
      <Footer />
    </main>
  )
}
