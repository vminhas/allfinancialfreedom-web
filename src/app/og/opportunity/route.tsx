import { ImageResponse } from 'next/og'

// Dynamic Open Graph image for the join.allfinancialfreedom.com/opportunity
// GHL funnel page. Rendered as a real PNG at /og/opportunity so Instagram,
// Messenger, and SMS previews show a branded card instead of a broken image
// icon. To use it, paste this URL into the og:image and twitter:image meta
// tags in the GHL Funnel Step Settings > Tracking Code > Header section.
//
// Edit branding (colors, headline, sub) by changing the JSX below and
// re-deploying. After deploying, force IG/FB to drop their cached preview
// by hitting https://developers.facebook.com/tools/debug/ and clicking
// "Scrape Again" on the funnel URL.

export const runtime = 'edge'
export const contentType = 'image/png'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0A1628 0%, #142D48 55%, #1E3A5F 100%)',
          padding: '72px 88px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          color: '#ffffff',
          position: 'relative',
        }}
      >
        {/* Top gold accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 10,
            background: '#C9A96E',
            display: 'flex',
          }}
        />

        {/* Subtle gold radial accent in the top-right */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 420,
            height: 420,
            borderRadius: 999,
            background:
              'radial-gradient(circle at center, rgba(201, 169, 110, 0.20) 0%, rgba(201, 169, 110, 0) 70%)',
            display: 'flex',
          }}
        />

        {/* Brand eyebrow */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.28em',
            color: '#C9A96E',
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          All Financial Freedom
        </div>

        {/* Headline */}
        <div
          style={{
            marginTop: 56,
            fontSize: 78,
            lineHeight: 1.04,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: '#ffffff',
            display: 'flex',
            maxWidth: 1000,
          }}
        >
          Build Something Meaningful in Financial Services
        </div>

        {/* Subhead */}
        <div
          style={{
            marginTop: 32,
            fontSize: 30,
            color: '#9BB0C4',
            letterSpacing: '0.01em',
            display: 'flex',
          }}
        >
          Remote · Licensed · Independent · 55+ Years of Experience
        </div>

        {/* Bottom strip */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 28,
            borderTop: '1px solid rgba(201, 169, 110, 0.35)',
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: '#C9A96E',
              fontWeight: 600,
              display: 'flex',
            }}
          >
            join.allfinancialfreedom.com/opportunity
          </div>
          <div
            style={{
              fontSize: 16,
              color: '#6B8299',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 700,
              display: 'flex',
            }}
          >
            Schedule a Zoom
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Aggressive cache: the image is deterministic. IG / FB scrape once
        // and re-scrape only when manually invalidated via the debugger.
        'Cache-Control': 'public, immutable, no-transform, max-age=31536000',
      },
    },
  )
}
