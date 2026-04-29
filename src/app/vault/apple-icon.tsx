import { ImageResponse } from 'next/og'

// Apple-touch-icon for /vault (180×180 PNG, runtime-rendered).
// Visually paired with the /agents icon — same navy/gold palette and
// monogram — but with a key glyph instead of a compass to signal
// admin/secured access. iOS uses this when an admin or LC saves the
// vault to their home screen.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #142D48 0%, #1B3A5C 60%, #2A5280 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'serif',
          color: '#fff',
        }}
      >
        {/* Top gold rule */}
        <div style={{ width: 120, height: 2, background: '#C9A96E', opacity: 0.85, marginBottom: 16 }} />

        {/* Key glyph */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#C9A96E', fontSize: 32, lineHeight: 1, marginBottom: 6,
          fontFamily: 'sans-serif',
        }}>
          ⚿
        </div>

        {/* AFF monogram */}
        <div style={{
          color: '#ffffff',
          fontSize: 60,
          fontWeight: 300,
          letterSpacing: -2,
          lineHeight: 1,
          fontFamily: 'serif',
        }}>
          AFF
        </div>

        {/* Tiny "VAULT" label */}
        <div style={{
          color: '#C9A96E',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 4,
          marginTop: 10,
          fontFamily: 'sans-serif',
          textTransform: 'uppercase',
        }}>
          Vault
        </div>

        {/* Bottom gold rule */}
        <div style={{ width: 120, height: 2, background: '#C9A96E', opacity: 0.85, marginTop: 16 }} />
      </div>
    ),
    { ...size }
  )
}
