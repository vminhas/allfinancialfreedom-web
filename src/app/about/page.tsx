import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { IMAGES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'About | All Financial Freedom',
  description: 'Learn about our mission to close the wealth gap and empower 100 million families to achieve financial independence.',
}

export default function About() {
  return (
    <main className="pt-20">

      {/* HERO */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-2xl">
          <span className="section-label">Our Story</span>
          <h1 className="section-title-light mb-5">
            Built to <em>close</em> the wealth gap.
          </h1>
          <p className="rich-text-light max-w-lg">
            We exist to make financial empowerment accessible to everyone, no matter their background, income, or starting point.
          </p>
        </div>
      </section>

      {/* WHO WE ARE */}
      <section className="page-section bg-white-section">
        <div className="grid md:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
          <div>
            <span className="section-label">Who We Are</span>
            <h2 className="section-title mb-6">More than advisors.<br /><em>We are a movement.</em></h2>
            <p className="rich-text mb-4">We are a team of passionate professionals on a mission to make financial empowerment accessible to everyone. We believe wealth is not just about numbers, it is about freedom, confidence, and peace of mind.</p>
            <p className="rich-text mb-4">That is why we meet you where you are, with personalized strategies for building, protecting, and passing on wealth. From budgeting and insurance to retirement and legacy planning, we guide real people through real-life decisions, without judgment, pressure, or confusing jargon.</p>
            <p className="rich-text mb-8">Because financial planning should feel personal, not transactional. <strong>And when you win, we all win.</strong></p>

            {/* Vision box */}
            <div className="card-premium p-6">
              <span className="gold-rule" />
              <h3 className="font-serif text-xl text-navy mb-3">Our Vision</h3>
              <p className="text-sm leading-relaxed text-muted-blue">
                To help empower <strong className="text-navy">100 million families</strong> to achieve financial independence, create generational wealth, and live a life on their terms. We are building a movement, one that inspires leadership, fuels ambitions, and changes the way people think about money and their legacy.
              </p>
            </div>
          </div>
          <div className="relative">
            <Image
              src={IMAGES.movement}
              alt="All Financial Freedom, We are a movement"
              width={560}
              height={560}
              className="object-cover w-full"
              style={{ height: 560, objectPosition: 'center center', borderRadius: 4 }}
            />
            <div className="absolute inset-0 -z-10" style={{
              transform: 'translate(12px, 12px)',
              border: '1px solid rgba(201,169,110,0.3)',
              borderRadius: 4
            }} />
          </div>
        </div>
      </section>

      {/* THE OPPORTUNITY */}
      <section className="page-section bg-sky">
        <div className="max-w-3xl">
          <span className="section-label">The Opportunity</span>
          <h2 className="section-title mb-4">A Financial Crossroads<br /><em>Is Here.</em></h2>
          <div className="font-serif font-light mt-6 mb-4" style={{ fontSize: 'clamp(3rem, 6vw, 5rem)', lineHeight: 1, color: '#1B3A5C' }}>
            $68 Trillion
          </div>
          <div className="w-10 h-px mb-6" style={{ background: '#C9A96E' }} />
          <p className="rich-text mb-4">An unprecedented shift is happening. As the baby boomer generation enters retirement, an estimated $68 trillion in wealth is expected to transfer to the next generation in the coming decades.</p>
          <p className="rich-text mb-4"><strong>But there is a problem, a growing wealth gap.</strong> Many individuals and families are unprepared to manage, protect, or grow this wealth. Without proper financial guidance, decades of hard work and savings could quickly erode.</p>
          <p className="rich-text">And far too often, traditional financial institutions overlook those who do not meet high asset thresholds, leaving millions without access to the support they need.</p>
        </div>
      </section>

      {/* OUR ANSWER */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-4xl mx-auto">
          <span className="section-label">Our Answer</span>
          <h2 className="section-title-light max-w-2xl mb-6">That is Where All Financial Freedom<br /><em>Comes In.</em></h2>
          <p className="rich-text-light max-w-2xl mb-4">We believe that financial success should not be reserved for the few, it should be accessible to everyone. Our mission is to close the wealth gap by equipping individuals and families with the knowledge, tools, and guidance to take control of their financial futures.</p>
          <p className="rich-text-light max-w-2xl mb-10">We take a holistic approach to financial empowerment by educating, guiding, and partnering with our clients to turn uncertainty into clarity and ambition into action.</p>
          <Link href="/team" className="btn-gold">Meet the Team</Link>
        </div>
      </section>

      <CTABanner heading="Your future is worth planning for." />
      <Footer />
    </main>
  )
}
