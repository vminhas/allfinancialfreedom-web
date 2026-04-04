'use client'

import { useState, useEffect } from 'react'
import Script from 'next/script'
import { GHL_BOOKING_URL, GHL_FORM_EMBED_SRC } from '@/lib/constants'

export default function BookingModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-booking', handler)
    return () => window.removeEventListener('open-booking', handler)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) {
      document.addEventListener('keydown', handleKey)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  if (!open) return null

  return (
    <>
      <Script src={GHL_FORM_EMBED_SRC} strategy="lazyOnload" />
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
      >
        <div
          className="relative w-[90%] max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm"
          style={{ background: '#161616', border: '1px solid rgba(201,169,110,0.2)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-8 py-6"
            style={{ borderBottom: '1px solid rgba(201,169,110,0.1)' }}
          >
            <h3 className="font-serif font-light text-2xl text-cream">
              Book a Free Consultation
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-gold text-2xl leading-none transition-colors px-2"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* GHL Calendar Embed */}
          <div className="p-8">
            <iframe
              src={GHL_BOOKING_URL}
              style={{ width: '100%', height: '600px', border: 'none', overflow: 'hidden' }}
              scrolling="no"
              id="8x5NwSvRLVwZk3TBTVmF_modal"
            />
          </div>
        </div>
      </div>
    </>
  )
}
