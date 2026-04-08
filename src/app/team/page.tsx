import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { TEAM, DIRECTORS, ASSOCIATES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import OpenJoinButton from '@/components/OpenJoinButton'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Our Team | All Financial Freedom',
  description: 'Meet the mission-driven leaders and licensed financial professionals behind All Financial Freedom. Led by Vick and Melinee Minhas with over 55 years of combined experience.',
  keywords: 'financial freedom team, licensed financial advisors, Vick Minhas CEO, Melinee Minhas COO, financial professionals, insurance agents, wealth advisors',
  openGraph: {
    title: 'Our Team | All Financial Freedom',
    description: 'Meet the mission-driven leaders and licensed financial professionals behind All Financial Freedom.',
    url: 'https://allfinancialfreedom.com/team',
    siteName: 'All Financial Freedom',
    type: 'website',
  },
}

export default function Team() {
  return (
    <main className="pt-20">

      {/* HERO */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-2xl">
          <span className="section-label">Our People</span>
          <h1 className="section-title-light mb-5">
            Driven by purpose.<br /><em>United by impact.</em>
          </h1>
          <p className="rich-text-light max-w-lg">
            We come from diverse backgrounds, but share one goal: transforming lives through financial empowerment.
          </p>
        </div>
      </section>

      {/* INTRO */}
      <section className="page-section bg-white-section">
        <div className="max-w-4xl">
          <span className="gold-rule" />
          <p className="font-serif font-light leading-relaxed" style={{ fontSize: 'clamp(1.15rem, 2vw, 1.4rem)', color: '#1B3A5C', lineHeight: 1.75 }}>
            At All Financial Freedom, our team is more than a group of professionals, we are a movement of mission-driven leaders, educators, and entrepreneurs passionate about transforming lives through financial empowerment. What unites us is a commitment to mentorship, collaboration, and impact.
            <br /><br />
            <em style={{ color: '#C9A96E' }}>We are not just building careers… we are building futures.</em>
          </p>
        </div>
      </section>

      {/* LEADERSHIP */}
      <section className="page-section bg-sky">
        <div className="text-center mb-14">
          <span className="section-label">Agency Owners</span>
          <h2 className="section-title"><em>Leadership</em> you can trust.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-16 max-w-5xl mx-auto">
          {TEAM.map(member => (
            <div key={member.name} className="group">
              {/* Photo */}
              <div className="relative overflow-hidden mb-6" style={{ aspectRatio: '3/4', borderRadius: 4 }}>
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                />
                {/* Subtle gold corner accent */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: '30%',
                  background: 'linear-gradient(transparent, rgba(20,45,72,0.6))'
                }} />
              </div>
              {/* Info */}
              <div style={{ borderLeft: '2px solid #C9A96E', paddingLeft: '1.25rem' }}>
                <h3 className="font-serif text-2xl text-navy mb-1">{member.name}</h3>
                <p className="text-xs tracking-widest uppercase font-medium mb-1" style={{ color: '#C9A96E' }}>
                  {member.title}
                </p>
                <p className="text-xs tracking-wide mb-4" style={{ color: '#6B8299' }}>
                  {member.credentials}
                </p>
                <p className="text-sm leading-relaxed text-muted-blue">{member.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DIRECTORS */}
      <section className="page-section bg-white-section">
        <div className="text-center mb-14">
          <span className="section-label">Directors</span>
          <h2 className="section-title"><em>Specialist Leadership</em></h2>
        </div>
        <div className="max-w-3xl mx-auto">
          {DIRECTORS.map(member => (
            <div key={member.name} className="flex gap-8 items-start group">
              <div className="relative overflow-hidden shrink-0" style={{ width: 140, height: 170, borderRadius: 4 }}>
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: '30%',
                  background: 'linear-gradient(transparent, rgba(20,45,72,0.5))'
                }} />
              </div>
              <div style={{ borderLeft: '2px solid #C9A96E', paddingLeft: '1.25rem' }}>
                <h3 className="font-serif text-2xl text-navy mb-1">{member.name}</h3>
                <p className="text-xs tracking-widest uppercase font-medium mb-1" style={{ color: '#C9A96E' }}>
                  {member.title}
                </p>
                <p className="text-xs tracking-wide mb-3" style={{ color: '#6B8299' }}>
                  {member.credentials}
                </p>
                <p className="text-sm leading-relaxed text-muted-blue">{member.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ASSOCIATES */}
      <section className="page-section bg-white-section">
        <div className="text-center mb-14">
          <span className="section-label">The Team</span>
          <h2 className="section-title"><em>Senior Associates</em></h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-5 max-w-6xl mx-auto">
          {ASSOCIATES.map(assoc => (
            <div key={assoc.name} className="card-premium text-center group overflow-hidden">
              {/* Photo or initials avatar */}
              {assoc.image ? (
                <div className="relative overflow-hidden" style={{ aspectRatio: '1/1' }}>
                  <Image
                    src={assoc.image}
                    alt={assoc.name}
                    fill
                    className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
                    background: 'linear-gradient(transparent, rgba(20,45,72,0.5))'
                  }} />
                </div>
              ) : (
                <div className="flex items-center justify-center mx-auto font-serif text-2xl font-light"
                  style={{
                    aspectRatio: '1/1',
                    background: 'linear-gradient(135deg, #142D48, #2A5280)',
                    color: '#C9A96E',
                  }}>
                  {assoc.initials}
                </div>
              )}
              <div className="p-5">
                <div className="font-serif text-base font-light text-navy mb-1">{assoc.name}</div>
                <div className="text-xs tracking-wider uppercase mb-1" style={{ color: '#C9A96E' }}>Senior Associate</div>
                <div className="text-xs" style={{ color: '#6B8299' }}>{assoc.specialty}</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(107,130,153,0.65)' }}>{assoc.location}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* RECRUITMENT PITCH */}
      <section className="page-section bg-navy-grad">
        <div className="grid md:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
          <div>
            <span className="section-label">Build Your Own Team</span>
            <h2 className="section-title-light mb-6">
              Ready to lead your own<br /><em>financial movement?</em>
            </h2>
            <p className="rich-text-light mb-4">
              All Financial Freedom isn&apos;t just a team, it&apos;s a launchpad. Our best associates go on to build their own teams, create their own brands, and lead their own movements, fully backed by our infrastructure and mentorship.
            </p>
            <p className="rich-text-light mb-8">
              If you have the drive to help families build wealth and the ambition to build something of your own, we want to meet you.
            </p>
            <OpenJoinButton className="btn-gold">Apply to Join</OpenJoinButton>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: '100%', label: 'Remote Opportunity' },
              { value: 'Day 1', label: 'Training Provided' },
              { value: '✓', label: 'Backed & Licensed' },
              { value: '$∞', label: 'Income Potential' },
            ].map(stat => (
              <div key={stat.label} className="p-6 text-center"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4 }}>
                <div className="font-serif text-3xl font-light text-white mb-1">{stat.value}</div>
                <div className="text-xs tracking-widest uppercase" style={{ color: 'rgba(201,169,110,0.8)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTABanner heading="Want to join the movement?" buttonText="Apply Now" action="join" />
      <Footer />
    </main>
  )
}
