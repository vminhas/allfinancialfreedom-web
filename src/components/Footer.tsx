import Link from 'next/link'
import Image from 'next/image'
import { IMAGES } from '@/lib/constants'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/team', label: 'Team' },
  { href: '/services', label: 'Services' },
  { href: '/testimonials', label: 'Testimonials' },
]

const services = [
  'Wealth Building', 'Asset Protection', 'Insurance Planning',
  'Budgeting & Planning', 'Retirement Planning', 'Legacy Planning',
]

export default function Footer() {
  return (
    <>
      <footer
        className="grid gap-12 px-16 py-16"
        style={{
          background: '#161616',
          borderTop: '1px solid rgba(201,169,110,0.1)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        <div>
          <Image src={IMAGES.logo} alt="All Financial Freedom" width={160} height={50} className="h-10 w-auto mb-4" />
          <p className="text-sm text-muted leading-relaxed max-w-xs">
            Empowering individuals and families to build wealth, protect assets, and create lasting legacies.
          </p>
        </div>

        <div>
          <h4 className="text-gold text-xs tracking-[0.2em] uppercase mb-5">Navigate</h4>
          <ul className="space-y-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted text-sm hover:text-cream transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-gold text-xs tracking-[0.2em] uppercase mb-5">Services</h4>
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s}>
                <Link href="/services" className="text-muted text-sm hover:text-cream transition-colors">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-gold text-xs tracking-[0.2em] uppercase mb-5">Connect</h4>
          <ul className="space-y-2">
            <li><a href="#" className="text-muted text-sm hover:text-cream transition-colors">Book a Call</a></li>
            <li><a href="mailto:info@allfinancialfreedom.com" className="text-muted text-sm hover:text-cream transition-colors">Contact Us</a></li>
            <li><a href="#" className="text-muted text-sm hover:text-cream transition-colors">Instagram</a></li>
            <li><a href="#" className="text-muted text-sm hover:text-cream transition-colors">LinkedIn</a></li>
          </ul>
        </div>
      </footer>

      <div
        className="flex flex-col md:flex-row justify-between items-center gap-2 px-16 py-4"
        style={{ background: '#161616', borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <p className="text-xs" style={{ color: 'rgba(138,133,128,0.6)' }}>
          © {new Date().getFullYear()} All Financial Freedom. All rights reserved.
        </p>
        <p className="text-xs" style={{ color: 'rgba(138,133,128,0.6)' }}>
          Privacy Policy · Terms of Service
        </p>
      </div>
    </>
  )
}
