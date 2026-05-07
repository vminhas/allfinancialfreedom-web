'use client'

import { useState } from 'react'
import { detectEmbedKind, loomEmbedUrl, driveEmbedUrl } from '@/lib/video-embed'

// Collapsible walkthrough player rendered inside an expanded checklist item.
// Detects Loom and Google Drive URLs and embeds via iframe; otherwise
// renders a native <video> tag that handles uploaded mp4/webm/mov from
// Vercel Blob.

interface Props {
  videoUrl: string
  videoTitle: string | null
  // 'portrait' = vertical phone-shot videos (Melinee's selfie intros).
  // 'landscape' = standard 16:9 (desktop screen recordings, etc.).
  // Default landscape because that's what most checklist walkthroughs are.
  orientation?: 'landscape' | 'portrait'
}

export default function ChecklistItemVideo({ videoUrl, videoTitle, orientation = 'landscape' }: Props) {
  const [open, setOpen] = useState(false)
  const kind = detectEmbedKind(videoUrl)
  const label = videoTitle?.trim() || 'Watch the walkthrough'

  return (
    <div style={{
      marginTop: 12, paddingTop: 10,
      borderTop: '1px dashed rgba(201,169,110,0.2)',
    }}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'rgba(201,169,110,0.06)',
          border: '1px solid rgba(201,169,110,0.25)', borderRadius: 6,
          color: '#C9A96E', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: 26, height: 26, borderRadius: '50%',
          background: '#C9A96E', color: '#142D48',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11,
        }}>▶</span>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ fontSize: 10, color: '#6B8299', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>

      {open && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}>
          {kind === 'loom' ? (
            <LoomFrame url={videoUrl} orientation={orientation} />
          ) : kind === 'drive' ? (
            <DriveFrame url={videoUrl} orientation={orientation} />
          ) : (
            <NativeVideo url={videoUrl} />
          )}
        </div>
      )}
    </div>
  )
}

// Loom + Drive iframes set aspect ratio from the orientation prop.
// Without this, portrait phone-shot videos letterbox down to a tiny
// center strip inside a 16:9 box (Melinee's welcome series ran into
// this on mobile). Portrait videos use 9:16 so the actual content
// fills the iframe naturally; landscape stays at 16:9. We cap at
// 70vh on portrait so the player doesn't dominate tall mobile
// viewports.
function aspectFor(orientation: 'landscape' | 'portrait') {
  return orientation === 'portrait' ? '9 / 16' : '16 / 9'
}

function LoomFrame({ url, orientation }: { url: string; orientation: 'landscape' | 'portrait' }) {
  // autoplay so the user only taps once: tapping the wrapper button opens
  // the iframe and Loom auto-starts the video. Without this, mobile users
  // had to tap twice — once to expand, again on the play button inside.
  // The wrapper button click counts as the user gesture so browsers allow
  // it without forcing mute.
  const embedUrl = loomEmbedUrl(url, { autoplay: true })
  if (!embedUrl) return <FallbackLink url={url} />
  return (
    <div style={{
      position: 'relative',
      aspectRatio: aspectFor(orientation),
      maxHeight: '70vh',
      maxWidth: orientation === 'portrait' ? 400 : '100%',
      margin: '0 auto',
      overflow: 'hidden', borderRadius: 6, background: '#000',
    }}>
      <iframe
        src={embedUrl}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )
}

function DriveFrame({ url, orientation }: { url: string; orientation: 'landscape' | 'portrait' }) {
  const embedUrl = driveEmbedUrl(url, { autoplay: true })
  if (!embedUrl) return <FallbackLink url={url} />
  return (
    <div style={{
      position: 'relative',
      aspectRatio: aspectFor(orientation),
      maxHeight: '70vh',
      // Portrait videos get a max-width cap so they don't blow up to
      // full window-width on desktop (a phone-shot 9:16 video at full
      // desktop width is over 800px tall, dominating the page). On
      // mobile this cap is moot because viewport is narrower than 400.
      maxWidth: orientation === 'portrait' ? 400 : '100%',
      margin: '0 auto',
      overflow: 'hidden', borderRadius: 6, background: '#000',
    }}>
      <iframe
        src={embedUrl}
        allow="autoplay; fullscreen"
        allowFullScreen
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )
}

// For directly-uploaded videos (Vercel Blob mp4/webm/mov) we let the
// browser pick the natural aspect ratio of the file. The previous
// `maxHeight: 480` cap letterboxed portrait phone-shot recordings
// into a too-wide box on mobile (the agent's video looked tiny with
// black bars). 70vh is generous on mobile (roughly 530px on iPhone)
// while keeping the video from dominating tall desktop windows.
function NativeVideo({ url }: { url: string }) {
  return (
    <video
      controls
      autoPlay
      preload="metadata"
      playsInline
      src={url}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        maxHeight: '70vh',
        margin: '0 auto',
        borderRadius: 6,
        background: '#000',
        objectFit: 'contain',
      }}
    />
  )
}

function FallbackLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#C9A96E', fontSize: 12 }}>
      Open video in a new tab ↗
    </a>
  )
}
