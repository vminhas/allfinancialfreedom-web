import { ImageResponse } from 'next/og'

// Apple-touch-icon for /agents (180×180 PNG returned at runtime).
// iOS picks this up when the agent saves the portal to their home screen
// via Safari's "Add to Home Screen". Visual: navy gradient + gold AFF
// monogram + subtle compass mark above suggesting the journey/trajectory
// theme of the phase tracker.

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
          position: 'relative',
        }}
      >
        {/* Top gold rule */}
        <div style={{ width: 120, height: 2, background: '#C9A96E', opacity: 0.85, marginBottom: 16 }} />

        {/* Compass / star mark */}
        <div style={{ display: 'flex', position: 'relative', width: 36, height: 36, marginBottom: 6 }}>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#C9A96E', fontSize: 36, lineHeight: 1, fontFamily: 'sans-serif',
          }}>✦</div>
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

        {/* Tiny "AGENT" label */}
        <div style={{
          color: '#C9A96E',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 4,
          marginTop: 10,
          fontFamily: 'sans-serif',
          textTransform: 'uppercase',
        }}>
          Agent
        </div>

        {/* Bottom gold rule */}
        <div style={{ width: 120, height: 2, background: '#C9A96E', opacity: 0.85, marginTop: 16 }} />
      </div>
    ),
    { ...size }
  )
}
