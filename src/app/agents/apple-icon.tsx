import { ImageResponse } from 'next/og'
import { PhoenixMark } from '@/components/PhoenixMark'

// Apple-touch-icon for /agents (180×180 PNG, runtime-rendered).
// Visual: navy gradient + the AFF gold phoenix mark + a small "AGENT"
// caption. Paired with /vault/apple-icon — same bird, different label.

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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex' }}>
          <PhoenixMark size={104} fill="#C9A96E" />
        </div>
        <div
          style={{
            color: '#C9A96E',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 5,
            marginTop: 4,
            fontFamily: 'sans-serif',
            textTransform: 'uppercase',
          }}
        >
          Agent
        </div>
      </div>
    ),
    { ...size }
  )
}
