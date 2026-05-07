// Video URL helpers for the agent checklist player. Admins paste either a
// Loom share URL, a Google Drive share URL, or a direct video URL (Vercel
// Blob upload, mp4, etc.); the renderer needs to know which embed
// strategy to use.
//
// Loom: requires "Anyone with the link can view" on the video itself,
// otherwise the embed shows a sign-in prompt instead of the player.
// Google Drive: same idea - the file's sharing setting must be
// "Anyone with the link" or the /preview iframe shows an access error.

// Loom IDs are typically 32-char hex but we allow letters, digits,
// hyphens, and underscores to be defensive against future changes.
const LOOM_SHARE_RE = /^https?:\/\/(?:www\.)?loom\.com\/share\/([a-zA-Z0-9_-]+)/i
const LOOM_EMBED_RE = /^https?:\/\/(?:www\.)?loom\.com\/embed\/([a-zA-Z0-9_-]+)/i

// Google Drive file URLs come in a few flavors:
//   https://drive.google.com/file/d/{ID}/view
//   https://drive.google.com/file/d/{ID}/preview
//   https://drive.google.com/open?id={ID}
//   https://drive.google.com/uc?id={ID}&export=download
// We extract {ID} from any of them and embed via /file/d/{ID}/preview
// which Google supports as a public iframe target.
const DRIVE_FILE_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i
const DRIVE_QUERY_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i

export type EmbedKind = 'loom' | 'drive' | 'native' | 'unknown'

export function detectEmbedKind(url: string | null | undefined): EmbedKind {
  if (!url) return 'unknown'
  if (LOOM_SHARE_RE.test(url) || LOOM_EMBED_RE.test(url)) return 'loom'
  if (DRIVE_FILE_RE.test(url) || DRIVE_QUERY_RE.test(url)) return 'drive'
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

// Convert any Google Drive video URL to its embeddable /preview URL. The
// file must be set to "Anyone with the link" in Drive's sharing settings
// for the iframe to actually render the video; otherwise it shows an
// access-required page.
export function driveEmbedUrl(url: string): string | null {
  const m = url.match(DRIVE_FILE_RE) ?? url.match(DRIVE_QUERY_RE)
  if (!m) return null
  return `https://drive.google.com/file/d/${m[1]}/preview`
}
