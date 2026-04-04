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
          background: '#1B3A5C',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        <div>
          <Image src={IMAGES.logo} alt="All Financial Freedom" width={160} height={50} className="h-10 w-auto mb-4" />
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(235,244,255,0.7)' }}>
            Empowering individuals and families to build wealth, protect assets, and create lasting legacies.
          </p>
        </div>

        <div>
          <h4 className="text-xs tracking-widest uppercase mb-5 font-medium" style={{ color: '#5B9FE8' }}>Navigate</h4>
          <ul className="space-y-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.65)' }}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs tracking-widest uppercase mb-5 font-medium" style={{ color: '#5B9FE8' }}>Services</h4>
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s}>
                <Link href="/services" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.65)' }}>
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs tracking-widest uppercase mb-5 font-medium" style={{ color: '#5B9FE8' }}>Connect</h4>
          <ul className="space-y-2">
            <li><a href="#" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.65)' }}>Book a Call</a></li>
            <li><a href="mailto:vick@allfinancialfreedom.com" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.65)' }}>Contact Us</a></li>
            <li><a href="#" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.65)' }}>Instagram</a></li>
            <li><a href="#" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(235,244,255,0.65)' }}>LinkedIn</a></li>
          </ul>
        </div>
      </footer>

      <div
        className="flex flex-col md:flex-row justify-between items-center gap-2 px-16 py-4"
        style={{ background: '#142D48', borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-xs" style={{ color: 'rgba(235,244,255,0.4)' }}>
          © {new Date().getFullYear()} All Financial Freedom. All rights reserved.
        </p>
        <p className="text-xs" style={{ color: 'rgba(235,244,255,0.4)' }}>
          Privacy Policy · Terms of Service
        </p>
      </div>
    </>
  )
}
