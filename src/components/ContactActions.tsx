// Tap-to-call / tap-to-email buttons used across the vault wherever
// we surface a phone or email next to an editable contact row. On iOS
// the tel:/mailto: hrefs trigger the native call/message sheet; on
// desktop they hand off to FaceTime or the default mail client.

import type { CSSProperties } from 'react'

// Strip to digits, prefix +1 for US 10-digit numbers, pass anything
// else through. Returns null when there's nothing dialable so callers
// can skip rendering instead of producing a tel: link to "".
export function toTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d]/g, '')
  if (!digits) return null
  const tel = digits.length === 10 ? `+1${digits}` : digits
  return `tel:${tel}`
}

const baseStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

export function CallButton({ phone, size = 'md', label = true, style }: {
  phone: string | null | undefined
  size?: 'sm' | 'md'
  label?: boolean
  style?: CSSProperties
}) {
  const href = toTelHref(phone)
  if (!href) return null
  return (
    <a
      href={href}
      title={`Call ${phone}`}
      onClick={e => e.stopPropagation()}
      style={{
        ...baseStyle,
        padding: size === 'sm' ? '0 8px' : '0 12px',
        height: size === 'sm' ? 24 : 'auto',
        background: 'rgba(74,222,128,0.10)',
        border: '1px solid rgba(74,222,128,0.35)',
        color: '#4ADE80',
        ...style,
      }}
    >
      {label ? '☏ Call' : '☏'}
    </a>
  )
}

export function EmailButton({ email, size = 'md', label = true, style }: {
  email: string | null | undefined
  size?: 'sm' | 'md'
  label?: boolean
  style?: CSSProperties
}) {
  if (!email) return null
  return (
    <a
      href={`mailto:${email}`}
      title={`Email ${email}`}
      onClick={e => e.stopPropagation()}
      style={{
        ...baseStyle,
        padding: size === 'sm' ? '0 8px' : '0 12px',
        height: size === 'sm' ? 24 : 'auto',
        background: 'rgba(201,169,110,0.10)',
        border: '1px solid rgba(201,169,110,0.35)',
        color: '#C9A96E',
        ...style,
      }}
    >
      {label ? '✉ Email' : '✉'}
    </a>
  )
}
