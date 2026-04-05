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
  { href: '/blog', label: 'Insights' },
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
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.0)',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(201,169,110,0.15)' : '1px solid transparent',
        boxShadow: scrolled ? '0 2px 24px rgba(27,58,92,0.08)' : 'none',
      }}
    >
      {/* Gold top accent bar, visible on scroll */}
      <div style={{
        height: 2,
        background: 'linear-gradient(90deg, transparent, #C9A96E, transparent)',
        opacity: scrolled ? 1 : 0,
        transition: 'opacity 0.3s',
      }} />

      <div className="flex items-center justify-between px-5 md:px-12 lg:px-20 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={IMAGES.logo}
            alt="All Financial Freedom"
            width={140}
            height={44}
            className="w-auto transition-all duration-300"
            style={{
              height: scrolled ? '38px' : '44px',
              filter: scrolled ? 'brightness(0)' : 'brightness(0) invert(1)',
            }}
          />
        </Link>

        {/* Desktop nav */}
        <ul className="hidden md:flex gap-9 list-none items-center">
          {navLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-xs tracking-widest uppercase transition-colors duration-200 font-medium relative group"
                  style={{
                    color: scrolled
                      ? (isActive ? '#C9A96E' : '#1B3A5C')
                      : (isActive ? '#C9A96E' : 'rgba(235,244,255,0.88)'),
                  }}
                >
                  {link.label}
                  <span style={{
                    display: 'block',
                    height: '1px',
                    background: '#C9A96E',
                    marginTop: '3px',
                    transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
                    transition: 'transform 0.2s',
                    transformOrigin: 'left',
                  }} className="group-hover:scale-x-100" />
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/join"
            className="text-xs tracking-widest uppercase font-medium transition-colors duration-200"
            style={{ color: scrolled ? '#C9A96E' : 'rgba(201,169,110,0.9)' }}>
            Join the Team
          </Link>
          <button onClick={openBooking} className="btn-gold" style={{ padding: '0.6rem 1.5rem' }}>
            Schedule a Call
          </button>
        </div>

        {/* Hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className="block w-6 h-px transition-all duration-300" style={{
            background: scrolled ? '#1B3A5C' : 'white',
            transform: menuOpen ? 'rotate(45deg) translateY(5px)' : ''
          }} />
          <span className="block w-6 h-px transition-all duration-300" style={{
            background: scrolled ? '#1B3A5C' : 'white',
            opacity: menuOpen ? 0 : 1
          }} />
          <span className="block w-6 h-px transition-all duration-300" style={{
            background: scrolled ? '#1B3A5C' : 'white',
            transform: menuOpen ? 'rotate(-45deg) translateY(-5px)' : ''
          }} />
        </button>
      </div>

      {/* Mobile menu */}
      <div style={{
        maxHeight: menuOpen ? '600px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.35s ease',
        background: 'rgba(255,255,255,0.98)',
        backdropFilter: 'blur(16px)',
      }}>
        {[...navLinks, { href: '/join', label: 'Join the Team' }].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block px-6 py-4 text-xs tracking-widest uppercase border-b font-medium"
            style={{
              color: pathname === link.href ? '#C9A96E' : '#1B3A5C',
              borderColor: 'rgba(201,169,110,0.1)',
            }}
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        <div className="p-5">
          <button onClick={openBooking} className="btn-gold w-full text-center">Schedule a Call</button>
        </div>
      </div>
    </nav>
  )
}
