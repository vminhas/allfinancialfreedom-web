'use client'

import Link from 'next/link'
import Image from 'next/image'
import { IMAGES } from '@/lib/constants'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/team', label: 'Team' },
  { href: '/services', label: 'Services' },
  { href: '/blog', label: 'Insights' },
  { href: '/testimonials', label: 'Testimonials' },
  { href: '/join', label: 'Join the Team' },
]

const services = [
  { label: 'Wealth Building',      anchor: 'wealth-building' },
  { label: 'Asset Protection',     anchor: 'asset-protection' },
  { label: 'Insurance Planning',   anchor: 'insurance-planning' },
  { label: 'Budgeting & Planning', anchor: 'budgeting-planning' },
  { label: 'Retirement Planning',  anchor: 'retirement-planning' },
  { label: 'Legacy Planning',      anchor: 'legacy-planning' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <>
      {/* Gold divider line */}
      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(201,169,110,0.4), transparent)',
      }} />

      <footer className="px-5 md:px-12 lg:px-20 pt-14 pb-10" style={{ background: '#142D48' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '2.5rem', maxWidth: '1200px' }}>

          {/* Brand column */}
          <div style={{ gridColumn: 'span 1' }}>
            <Image src={IMAGES.logo} alt="All Financial Freedom" width={150} height={48} className="h-10 w-auto mb-5" />
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(235,244,255,0.55)', maxWidth: '220px' }}>
              Empowering individuals and families to build wealth, protect assets, and create lasting legacies.
            </p>
          </div>

          {/* Navigate */}
          <div>
            <h4 className="text-xs tracking-widest uppercase mb-5 font-medium" style={{ color: '#C9A96E' }}>Navigate</h4>
            <ul className="space-y-2.5">
              {navLinks.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm transition-colors hover:text-white"
                    style={{ color: 'rgba(235,244,255,0.55)' }}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-xs tracking-widest uppercase mb-5 font-medium" style={{ color: '#C9A96E' }}>Services</h4>
            <ul className="space-y-2.5">
              {services.map(s => (
                <li key={s.label}>
                  <Link href={`/services#${s.anchor}`} className="text-sm transition-colors hover:text-white"
                    style={{ color: 'rgba(235,244,255,0.55)' }}>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-xs tracking-widest uppercase mb-5 font-medium" style={{ color: '#C9A96E' }}>Connect</h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('open-booking'))}
                  className="text-sm transition-colors hover:text-white text-left"
                  style={{ color: 'rgba(235,244,255,0.55)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Schedule a Call
                </button>
              </li>
              <li>
                <a href="mailto:contact@allfinancialfreedom.com" className="text-sm transition-colors hover:text-white"
                  style={{ color: 'rgba(235,244,255,0.55)' }}>
                  contact@allfinancialfreedom.com
                </a>
              </li>
              <li>
                <a href="https://instagram.com/allfinancialfreedom" target="_blank" rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.55)' }}>
                  Instagram
                </a>
              </li>
              <li>
                <a href="https://linkedin.com/company/allfinancialfreedom" target="_blank" rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.55)' }}>
                  LinkedIn
                </a>
              </li>
            </ul>
            <p className="text-xs mt-6 leading-relaxed" style={{ color: 'rgba(235,244,255,0.3)', maxWidth: '200px' }}>
              Licensed insurance professionals. Products and availability vary by state.
            </p>
          </div>
        </div>
      </footer>

      {/* Bottom bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-2 px-5 md:px-12 lg:px-20 py-4"
        style={{ background: '#0E2035', borderTop: '1px solid rgba(201,169,110,0.08)' }}>
        <p className="text-xs" style={{ color: 'rgba(235,244,255,0.3)' }}>
          © {year} All Financial Freedom. All rights reserved.
        </p>
        <div className="flex gap-4">
          <Link href="/privacy" className="text-xs transition-colors hover:text-white"
            style={{ color: 'rgba(235,244,255,0.3)' }}>
            Privacy Policy
          </Link>
          <span style={{ color: 'rgba(235,244,255,0.15)' }}>·</span>
          <Link href="/terms" className="text-xs transition-colors hover:text-white"
            style={{ color: 'rgba(235,244,255,0.3)' }}>
            Terms of Service
          </Link>
        </div>
      </div>
    </>
  )
}
