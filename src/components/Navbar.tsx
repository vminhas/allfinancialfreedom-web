'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { IMAGES } from '@/lib/constants'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/team', label: 'Team' },
  { href: '/services', label: 'Services' },
  { href: '/testimonials', label: 'Testimonials' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const openBooking = () => {
    window.dispatchEvent(new CustomEvent('open-booking'))
    setMenuOpen(false)
  }

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-all duration-300"
      style={{
        padding: '1rem 4rem',
        background: scrolled ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: scrolled ? '1px solid rgba(59,126,200,0.12)' : '1px solid transparent',
        boxShadow: scrolled ? '0 2px 20px rgba(27,58,92,0.08)' : 'none',
      }}
    >
      <Link href="/" className="flex items-center gap-3">
        <Image src={IMAGES.logo} alt="All Financial Freedom" width={140} height={44} className="h-11 w-auto" />
      </Link>

      <ul className="hidden md:flex gap-10 list-none">
        {navLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-xs tracking-widest uppercase transition-colors duration-200 font-medium"
              style={{ color: pathname === link.href ? '#3B7EC8' : '#1B3A5C' }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <button onClick={openBooking} className="btn-primary hidden md:inline-block">
        Book a Call
      </button>

      <button
        className="md:hidden flex flex-col gap-1.5 p-2"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        <span className="block w-6 h-px transition-all" style={{ background: '#1B3A5C', transform: menuOpen ? 'rotate(45deg) translateY(4px)' : '' }} />
        <span className="block w-6 h-px transition-all" style={{ background: '#1B3A5C', opacity: menuOpen ? 0 : 1 }} />
        <span className="block w-6 h-px transition-all" style={{ background: '#1B3A5C', transform: menuOpen ? 'rotate(-45deg) translateY(-4px)' : '' }} />
      </button>

      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border-t border-blue/10 md:hidden shadow-lg">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-6 py-4 text-xs tracking-widest uppercase border-b border-blue/5 font-medium"
              style={{ color: pathname === link.href ? '#3B7EC8' : '#1B3A5C' }}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="p-6">
            <button onClick={openBooking} className="btn-primary w-full text-center">Book a Call</button>
          </div>
        </div>
      )}
    </nav>
  )
}
