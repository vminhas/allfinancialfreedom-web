'use client'

import { useEffect } from 'react'
import { persistAttributionFromUrl } from '@/lib/attribution'

// Site-wide first-touch attribution capture. Mounted once in the root layout so
// utm_* + gclid/fbclid are stored the moment a visitor lands from an ad, on ANY
// page (homepage, retirement-income, etc.), and survive navigation to the lead
// form. Renders nothing.
export default function AttributionCapture() {
  useEffect(() => {
    persistAttributionFromUrl()
  }, [])
  return null
}
