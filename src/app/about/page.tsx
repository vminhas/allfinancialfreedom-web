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
      {/* Page Hero */}
      <section className="page-section" style={{ background: '#161616', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
        <p className="section-label">Our Story</p>
        <h1 className="section-title">Built to <em>close</em> the wealth gap.</h1>
        <p className="text-muted mt-4 max-w-lg leading-relaxed">
          We exist to make financial empowerment accessible to everyone — no matter their background, income, or starting point.
        </p>
      </section>

      {/* Who We Are */}
      <section className="page-section" style={{ background: '#161616' }}>
        <div className="grid md:grid-cols-2 gap-20 items-center">
          <div>
            <p className="section-label">Who We Are</p>
            <h2 className="section-title mb-6">More than advisors.<br /><em>We&apos;re a movement.</em></h2>
            <p className="rich-text">We&apos;re a team of passionate professionals on a mission to make financial empowerment accessible to everyone. We believe wealth isn&apos;t just about numbers — it&apos;s about freedom, confidence, and peace of mind.</p>
            <p className="rich-text mt-4">That&apos;s why we meet you where you are, with personalized strategies for building, protecting, and passing on wealth. From budgeting and insurance to retirement and legacy planning, we guide real people through real-life decisions — without judgment, pressure, or confusing jargon.</p>
            <p className="rich-text mt-4">Because financial planning should feel personal, not transactional. <strong>And when you win, we all win.</strong></p>
            <div className="mt-8 p-6 rounded-sm" style={{ background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.15)' }}>
              <h3 className="font-serif text-xl text-gold mb-3">Our Vision</h3>
              <p className="text-sm text-muted leading-relaxed">
                To help empower <strong className="text-cream">100 million families</strong> to achieve financial independence, create generational wealth, and live a life on their terms. We&apos;re building a movement — one that inspires leadership, fuels ambitions, and changes the way people think about money and their legacy.
              </p>
            </div>
          </div>
          <div className="relative">
            <Image src={IMAGES.melinee} alt="All Financial Freedom team" width={560} height={560} className="object-cover w-full rounded-sm" style={{ height: '560px', objectPosition: 'center 15%' }} />
          </div>
        </div>
      </section>

      {/* Financial Crossroads */}
      <section className="page-section" style={{ background: '#1E1E1E' }}>
        <div className="max-w-3xl">
          <p className="section-label">The Opportunity</p>
          <h2 className="section-title">A Financial Crossroads<br /><em>Is Here…</em></h2>
          <div className="font-serif font-light text-gold mt-6 mb-6" style={{ fontSize: '5rem', lineHeight: 1 }}>
            $68 Trillion
          </div>
          <p className="rich-text">An unprecedented shift is happening. As the baby boomer generation enters retirement, an estimated $68 trillion in wealth is expected to transfer to the next generation in the coming decades.</p>
          <p className="rich-text mt-4"><strong>But there&apos;s a problem — a growing wealth gap.</strong> Many individuals and families are unprepared to manage, protect, or grow this wealth. Without proper financial guidance, decades of hard work and savings could quickly erode.</p>
          <p className="rich-text mt-4">And far too often, traditional financial institutions overlook those who don&apos;t meet high asset thresholds — leaving millions without access to the support they need.</p>
        </div>
      </section>

      {/* Our Answer */}
      <section className="page-section" style={{ background: '#0D0D0D' }}>
        <p className="section-label">Our Answer</p>
        <h2 className="section-title max-w-2xl mb-6">
          That&apos;s Where All Financial Freedom<br /><em>Comes In…</em>
        </h2>
        <p className="rich-text max-w-2xl">We believe that financial success shouldn&apos;t be reserved for the few — it should be accessible to everyone. Our mission is to close the wealth gap by equipping individuals and families with the knowledge, tools, and guidance to take control of their financial futures.</p>
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
