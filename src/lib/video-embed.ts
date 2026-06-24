// Video URL helpers for the agent checklist player. Admins paste either a
// Loom share URL, a Google Drive share URL, a YouTube URL, or a direct
// video URL (Vercel Blob upload, mp4, etc.); the renderer needs to know
// which embed strategy to use.

const LOOM_SHARE_RE = /^https?:\/\/(?:www\.)?loom\.com\/share\/([a-zA-Z0-9_-]+)/i
const LOOM_EMBED_RE = /^https?:\/\/(?:www\.)?loom\.com\/embed\/([a-zA-Z0-9_-]+)/i

const DRIVE_FILE_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i
const DRIVE_QUERY_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i

// YouTube URLs:
//   https://www.youtube.com/watch?v={ID}
//   https://youtu.be/{ID}
//   https://www.youtube.com/embed/{ID}
//   https://www.youtube.com/shorts/{ID}
const YT_WATCH_RE = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})/i
const YT_SHORT_RE = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/i
const YT_EMBED_RE = /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i
const YT_SHORTS_RE = /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i

export type EmbedKind = 'loom' | 'drive' | 'youtube' | 'native' | 'unknown'

export function detectEmbedKind(url: string | null | undefined): EmbedKind {
  if (!url) return 'unknown'
  if (LOOM_SHARE_RE.test(url) || LOOM_EMBED_RE.test(url)) return 'loom'
  if (DRIVE_FILE_RE.test(url) || DRIVE_QUERY_RE.test(url)) return 'drive'
  if (YT_WATCH_RE.test(url) || YT_SHORT_RE.test(url) || YT_EMBED_RE.test(url) || YT_SHORTS_RE.test(url)) return 'youtube'
  return 'native'
}

// Convert a Loom share URL to its embeddable iframe URL. If already an embed
// URL, return as-is. Returns null if the URL isn't a recognizable Loom URL.
export function loomEmbedUrl(url: string): string | null {
  const share = url.match(LOOM_SHARE_RE)
  if (share) return `https://www.loom.com/embed/${share[1]}`
  if (LOOM_EMBED_RE.test(url)) return url
  return null
}

// Convert any Google Drive video URL to its embeddable /preview URL. The
// file must be set to "Anyone with the link" in Drive's sharing settings
// for the iframe to actually render the video; otherwise it shows an
// access-required page.
export function driveEmbedUrl(url: string): string | null {
  const m = url.match(DRIVE_FILE_RE) ?? url.match(DRIVE_QUERY_RE)
  if (!m) return null
  return `https://drive.google.com/file/d/${m[1]}/preview`
}

export function youtubeEmbedUrl(url: string): string | null {
  const m = url.match(YT_WATCH_RE) ?? url.match(YT_SHORT_RE) ?? url.match(YT_EMBED_RE) ?? url.match(YT_SHORTS_RE)
  if (!m) return null
  return `https://www.youtube.com/embed/${m[1]}`
}
