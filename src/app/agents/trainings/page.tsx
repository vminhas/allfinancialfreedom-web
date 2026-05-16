'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/useIsMobile'

// Agent-facing trainings page.
//
// Lists the same TrainingEvent rows the admin manages in
// /vault/trainings, scoped to `published: true` and the 7-back / 60-
// ahead window served by /api/agents/trainings. Each card carries a
// "Download flyer" button that pulls the public Vercel Blob URL and
// triggers a direct download, mirroring the pattern in /agents/team
// for headshots.

interface Presenter { name: string; role: string }
interface Training {
  id: string
  title: string
  subtitle: string | null
  category: string | null
  startsAt: string
  durationMinutes: number
  flyerImageUrl: string | null
  streamType: 'GFI_LIVE' | 'ZOOM'
  streamRoomName: string | null
  streamId: string | null
  passcode: string | null
  audienceRestriction: string | null
  partnerBrand: string | null
  targetRegion: string | null
  presenters: Presenter[]
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  })
}

// Build the one-click Zoom join URL the T-15 reminder uses, so an agent
// browsing the page on their phone can tap and land in the meeting.
function joinUrlFor(t: Training): string | null {
  if (!t.streamId) return null
  if (t.streamType !== 'ZOOM') return null
  const cleanId = t.streamId.replace(/[\s-]/g, '')
  return `https://zoom.us/j/${cleanId}${t.passcode ? `?pwd=${encodeURIComponent(t.passcode)}` : ''}`
}

export default function TrainingsPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [trainings, setTrainings] = useState<Training[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents/trainings')
      if (res.ok) {
        const d = await res.json() as { trainings: Training[] }
        setTrainings(d.trainings ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const downloadFlyer = useCallback(async (t: Training) => {
    if (!t.flyerImageUrl) return
    setDownloadingId(t.id)
    try {
      const ext = (t.flyerImageUrl.match(/\.([a-zA-Z0-9]{3,4})(?:\?|#|$)/) ?? [])[1]?.toLowerCase() ?? 'jpg'
      const safeTitle = t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      const filename = `${safeTitle || 'training'}-flyer.${ext}`

      let blob: Blob | null = null
      try {
        const res = await fetch(t.flyerImageUrl, { mode: 'cors' })
        if (res.ok) blob = await res.blob()
      } catch { /* CORS fallback below */ }

      if (blob) {
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
        const nav = navigator as Navigator & {
          canShare?: (d: { files: File[] }) => boolean
          share?: (d: { files: File[]; title?: string }) => Promise<void>
        }
        if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
          try { await nav.share({ files: [file], title: t.title }); return }
          catch (err) { if ((err as Error).name === 'AbortError') return }
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else {
        // CORS denied the fetch — fall back to opening the asset in a new
        // tab; the user can save-as from there.
        window.open(t.flyerImageUrl, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setDownloadingId(null)
    }
  }, [])

  const now = Date.now()
  const upcoming = trainings.filter(t => new Date(t.startsAt).getTime() >= now - 5 * 60_000)
  const past = trainings.filter(t => new Date(t.startsAt).getTime() < now - 5 * 60_000).reverse()

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628' }}>
      {/* Sticky top bar */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: isMobile
          ? 'calc(10px + env(safe-area-inset-top)) 14px 10px'
          : 'calc(14px + env(safe-area-inset-top)) clamp(16px,4vw,32px) 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: '#C9A96E', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 1 }}>Trainings</div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(16px,4vw,28px)' }}>
        {loading && (
          <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>Loading...</div>
        )}

        {!loading && trainings.length === 0 && (
          <div style={{ color: '#6B8299', fontSize: 13, textAlign: 'center', padding: 60 }}>
            No upcoming trainings on the calendar right now. Check back soon.
          </div>
        )}

        {!loading && upcoming.length > 0 && (
          <Section label="Upcoming" trainings={upcoming} onDownload={downloadFlyer} downloadingId={downloadingId} isMobile={isMobile} />
        )}

        {!loading && past.length > 0 && (
          <Section label="Recent" trainings={past} onDownload={downloadFlyer} downloadingId={downloadingId} isMobile={isMobile} />
        )}
      </div>
    </div>
  )
}

function Section({
  label, trainings, onDownload, downloadingId, isMobile,
}: {
  label: string
  trainings: Training[]
  onDownload: (t: Training) => void
  downloadingId: string | null
  isMobile: boolean
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: '#C9A96E', marginBottom: 12,
      }}>
        {label} · {trainings.length}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {trainings.map(t => (
          <TrainingCard key={t.id} t={t} onDownload={onDownload} downloading={downloadingId === t.id} />
        ))}
      </div>
    </div>
  )
}

function TrainingCard({
  t, onDownload, downloading,
}: {
  t: Training
  onDownload: (t: Training) => void
  downloading: boolean
}) {
  const join = joinUrlFor(t)
  return (
    <div style={{
      background: '#132238',
      border: '1px solid rgba(201,169,110,0.15)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Flyer (or placeholder gradient when no flyer is on file) */}
      <div style={{
        position: 'relative',
        width: '100%', aspectRatio: '4 / 3',
        background: t.flyerImageUrl
          ? `#0A1628 url(${t.flyerImageUrl}) center/cover no-repeat`
          : 'linear-gradient(135deg, #1A2C49 0%, #0A1628 100%)',
        borderBottom: '1px solid rgba(201,169,110,0.1)',
      }}>
        {!t.flyerImageUrl && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#3F4B5C', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            No flyer
          </div>
        )}
        {t.audienceRestriction && (
          <div style={{
            position: 'absolute', top: 10, left: 10,
            background: 'rgba(10,22,40,0.85)', border: '1px solid rgba(245,158,11,0.4)',
            color: '#f59e0b', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '4px 8px', borderRadius: 3,
          }}>
            🔒 {t.audienceRestriction}
          </div>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E' }}>
            {formatDateTime(t.startsAt)} &middot; {t.durationMinutes} min
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginTop: 6, lineHeight: 1.3 }}>
            {t.title}
          </div>
          {t.subtitle && (
            <div style={{ fontSize: 12, color: '#9BB0C4', marginTop: 4, lineHeight: 1.4 }}>
              {t.subtitle}
            </div>
          )}
          {t.category && (
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, fontStyle: 'italic' }}>
              {t.category}
            </div>
          )}
        </div>

        {t.presenters.length > 0 && (
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.5 }}>
            {t.presenters.map((p, i) => (
              <div key={i}>
                <strong style={{ color: '#fff' }}>{p.name}</strong>
                {p.role ? ` · ${p.role}` : ''}
              </div>
            ))}
          </div>
        )}

        {(t.partnerBrand || t.targetRegion) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {t.partnerBrand && (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9B6DFF', background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.2)', padding: '3px 7px', borderRadius: 3 }}>
                🤝 {t.partnerBrand}
              </span>
            )}
            {t.targetRegion && (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#60A5FA', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', padding: '3px 7px', borderRadius: 3 }}>
                🌍 {t.targetRegion}
              </span>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {/* Download flyer button. Greyed out when there's no flyer
              on file (Drive sync may not have parsed the image yet,
              or the event was created manually without one). */}
          <button
            onClick={() => onDownload(t)}
            disabled={!t.flyerImageUrl || downloading}
            style={{
              flex: 1, minWidth: 140,
              background: t.flyerImageUrl ? 'rgba(201,169,110,0.10)' : 'transparent',
              border: `1px solid ${t.flyerImageUrl ? 'rgba(201,169,110,0.35)' : 'rgba(255,255,255,0.08)'}`,
              color: t.flyerImageUrl ? '#C9A96E' : '#4B5563',
              borderRadius: 4, padding: '9px 12px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: !t.flyerImageUrl ? 'not-allowed' : (downloading ? 'wait' : 'pointer'),
            }}
          >
            {downloading ? 'Downloading...' : t.flyerImageUrl ? '📥 Download Flyer' : 'No flyer yet'}
          </button>
          {join && (
            <a
              href={join}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1, minWidth: 140, textAlign: 'center',
                background: '#C9A96E', color: '#142D48',
                borderRadius: 4, padding: '9px 12px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none',
              }}
            >
              {t.streamType === 'ZOOM' ? '🎥 Join Zoom' : '📺 Join Stream'}
            </a>
          )}
        </div>

        {(t.streamId || t.passcode) && (
          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
            {t.streamId && <>ID: <code style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 2, color: '#9BB0C4' }}>{t.streamId}</code></>}
            {t.streamId && t.passcode && ' · '}
            {t.passcode && <>Passcode: <code style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 2, color: '#9BB0C4' }}>{t.passcode}</code></>}
          </div>
        )}
      </div>
    </div>
  )
}
