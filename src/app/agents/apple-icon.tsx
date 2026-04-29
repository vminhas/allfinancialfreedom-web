import { ImageResponse } from 'next/og'
import { PhoenixMark } from '@/components/PhoenixMark'

// Apple-touch-icon for /agents (180×180 PNG, runtime-rendered).
// Phoenix only — no text caption. iOS shows the home-screen label
// ("AFF Agent" from layout.tsx appleWebApp.title) underneath the icon
// so we can tell agent vs vault apart without putting text inside the
// icon itself, which gets noisy at the ~60px size iOS displays.

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
          <PhoenixMark size={150} fill="#C9A96E" />
        </div>
      </div>
    ),
    { ...size }
  )
}
