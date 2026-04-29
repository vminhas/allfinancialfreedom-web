// Video URL helpers for the agent checklist player. Admins paste either a
// Loom share URL or a direct video URL (Vercel Blob upload, mp4, etc.); the
// renderer needs to know which to embed via iframe vs <video>.

const LOOM_SHARE_RE = /^https?:\/\/(?:www\.)?loom\.com\/share\/([a-zA-Z0-9]+)/i
const LOOM_EMBED_RE = /^https?:\/\/(?:www\.)?loom\.com\/embed\/([a-zA-Z0-9]+)/i

export type EmbedKind = 'loom' | 'native' | 'unknown'

export function detectEmbedKind(url: string | null | undefined): EmbedKind {
  if (!url) return 'unknown'
  if (LOOM_SHARE_RE.test(url) || LOOM_EMBED_RE.test(url)) return 'loom'
  // Anything that looks like a direct video URL — blob.vercel-storage.com,
  // .mp4 / .webm / .mov — falls into native HTML5 <video>. We don't try to
  // sniff Content-Type up front; if the browser can't play it, the video
  // element shows its own error state which is fine.
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
