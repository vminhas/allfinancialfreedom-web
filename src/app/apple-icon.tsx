import { ImageResponse } from 'next/og'
import { PhoenixMark } from '@/components/PhoenixMark'

// Root-level apple-touch-icon. Acts as the fallback for any page outside
// the /agents and /vault segments — public marketing site, login pages,
// 404s, etc. Same phoenix mark, no segment label.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0F1E33 0%, #142D48 55%, #1B3A5C 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex' }}>
          <PhoenixMark size={120} fill="#C9A96E" />
        </div>
      </div>
    ),
    { ...size }
  )
}
