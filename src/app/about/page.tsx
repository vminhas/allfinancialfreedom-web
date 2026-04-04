import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { IMAGES } from '@/lib/constants'
import CTABanner from '@/components/CTABanner'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'About — All Financial Freedom',
  description: 'Learn about our mission to close the wealth gap and empower 100 million families to achieve financial independence.',
}

export default function About() {
  return (
    <main className="pt-20">
      <section className="page-section" style={{ background: '#EBF4FF', borderBottom: '1px solid rgba(59,126,200,0.1)' }}>
        <p className="section-label">Our Story</p>
        <h1 className="section-title">Built to <em>close</em> the wealth gap.</h1>
        <p className="mt-4 max-w-lg leading-relaxed" style={{ color: '#6B8299' }}>
          We exist to make financial empowerment accessible to everyone — no matter their background, income, or starting point.
        </p>
      </section>

      <section className="page-section" style={{ background: 'white' }}>
        <div className="grid md:grid-cols-2 gap-20 items-center">
          <div>
            <p className="section-label">Who We Are</p>
            <h2 className="section-title mb-6">More than advisors.<br /><em>We are a movement.</em></h2>
            <p className="rich-text">We are a team of passionate professionals on a mission to make financial empowerment accessible to everyone. We believe wealth is not just about numbers — it is about freedom, confidence, and peace of mind.</p>
            <p className="rich-text mt-4">That is why we meet you where you are, with personalized strategies for building, protecting, and passing on wealth. From budgeting and insurance to retirement and legacy planning, we guide real people through real-life decisions — without judgment, pressure, or confusing jargon.</p>
            <p className="rich-text mt-4">Because financial planning should feel personal, not transactional. <strong>And when you win, we all win.</strong></p>
            <div className="mt-8 p-6 rounded-lg" style={{ background: '#EBF4FF', border: '1px solid rgba(59,126,200,0.2)' }}>
              <h3 className="font-serif text-xl mb-3" style={{ color: '#1B3A5C' }}>Our Vision</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#6B8299' }}>
                To help empower <strong style={{ color: '#1B3A5C' }}>100 million families</strong> to achieve financial independence, create generational wealth, and live a life on their terms. We are building a movement — one that inspires leadership, fuels ambitions, and changes the way people think about money and their legacy.
              </p>
            </div>
          </div>
          <div className="relative">
            <Image src={IMAGES.melinee} alt="All Financial Freedom" width={560} height={560} className="object-cover w-full rounded-lg" style={{ height: '560px', objectPosition: 'center 15%' }} />
            <div className="absolute -top-4 -right-4 w-full h-full rounded-lg -z-10" style={{ border: '2px solid rgba(59,126,200,0.2)' }} />
          </div>
        </div>
      </section>

      <section className="page-section" style={{ background: '#F5F9FF' }}>
        <div className="max-w-3xl">
          <p className="section-label">The Opportunity</p>
          <h2 className="section-title">A Financial Crossroads<br /><em>Is Here.</em></h2>
          <div className="font-serif font-light mt-6 mb-6" style={{ fontSize: '5rem', lineHeight: 1, color: '#3B7EC8' }}>$68 Trillion</div>
          <p className="rich-text">An unprecedented shift is happening. As the baby boomer generation enters retirement, an estimated $68 trillion in wealth is expected to transfer to the next generation in the coming decades.</p>
          <p className="rich-text mt-4"><strong>But there is a problem — a growing wealth gap.</strong> Many individuals and families are unprepared to manage, protect, or grow this wealth. Without proper financial guidance, decades of hard work and savings could quickly erode.</p>
          <p className="rich-text mt-4">And far too often, traditional financial institutions overlook those who do not meet high asset thresholds — leaving millions without access to the support they need.</p>
        </div>
      </section>

      <section className="page-section" style={{ background: 'white' }}>
        <p className="section-label">Our Answer</p>
        <h2 className="section-title max-w-2xl mb-6">That is Where All Financial Freedom<br /><em>Comes In.</em></h2>
        <p className="rich-text max-w-2xl">We believe that financial success should not be reserved for the few — it should be accessible to everyone. Our mission is to close the wealth gap by equipping individuals and families with the knowledge, tools, and guidance to take control of their financial futures.</p>
        <p className="rich-text max-w-2xl mt-4">We take a holistic approach to financial empowerment by educating, guiding, and partnering with our clients to turn uncertainty into clarity and ambition into action.</p>
        <div className="mt-10">
          <Link href="/team" className="btn-primary">Meet the Team</Link>
        </div>
      </section>

      <CTABanner heading="Your future is worth planning for." />
      <Footer />
    </main>
  )
}
