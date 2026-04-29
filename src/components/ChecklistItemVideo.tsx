'use client'

import { useState } from 'react'
import { detectEmbedKind, loomEmbedUrl } from '@/lib/video-embed'

// Collapsible walkthrough player rendered inside an expanded checklist item.
// Detects Loom URLs and embeds via iframe; otherwise renders a native
// <video> tag that handles uploaded mp4/webm/mov from Vercel Blob.

interface Props {
  videoUrl: string
  videoTitle: string | null
}

export default function ChecklistItemVideo({ videoUrl, videoTitle }: Props) {
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
            <LoomFrame url={videoUrl} />
          ) : (
            <NativeVideo url={videoUrl} />
          )}
        </div>
      )}
    </div>
  )
}

function LoomFrame({ url }: { url: string }) {
  const embedUrl = loomEmbedUrl(url)
  if (!embedUrl) return <FallbackLink url={url} />
  return (
    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 6, background: '#000' }}>
      <iframe
        src={embedUrl}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )
}

function NativeVideo({ url }: { url: string }) {
  return (
    <video
      controls
      preload="metadata"
      src={url}
      style={{ width: '100%', maxHeight: 480, borderRadius: 6, background: '#000', display: 'block' }}
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
