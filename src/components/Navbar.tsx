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
    const event = new CustomEvent('open-booking')
    window.dispatchEvent(event)
    setMenuOpen(false)
  }

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-16 py-5 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(13,13,13,0.97)' : 'rgba(13,13,13,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(201,169,110,0.12)',
      }}
    >
      <Link href="/" className="flex items-center gap-3">
        <Image src={IMAGES.logo} alt="All Financial Freedom" width={140} height={44} className="h-11 w-auto" />
      </Link>

      {/* Desktop links */}
      <ul className="hidden md:flex gap-10 list-none">
        {navLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-xs tracking-widest uppercase transition-colors duration-200"
              style={{
                color: pathname === link.href ? '#C9A96E' : 'rgba(240,237,232,0.75)',
              }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <button onClick={openBooking} className="btn-primary hidden md:inline-block">
        Book a Call
      </button>

      {/* Mobile hamburger */}
      <button
        className="md:hidden flex flex-col gap-1.5 p-2"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        <span className="block w-6 h-px bg-cream transition-all" style={{ transform: menuOpen ? 'rotate(45deg) translateY(4px)' : '' }} />
        <span className="block w-6 h-px bg-cream transition-all" style={{ opacity: menuOpen ? 0 : 1 }} />
        <span className="block w-6 h-px bg-cream transition-all" style={{ transform: menuOpen ? 'rotate(-45deg) translateY(-4px)' : '' }} />
      </button>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-dark-2 border-t border-gold/10 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-6 py-4 text-xs tracking-widest uppercase border-b border-gold/5"
              style={{ color: pathname === link.href ? '#C9A96E' : 'rgba(240,237,232,0.75)' }}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="p-6">
            <button onClick={openBooking} className="btn-primary w-full text-center">
              Book a Call
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
