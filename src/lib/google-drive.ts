/**
 * Google Drive helpers for *publicly shared* folders.
 * Uses a Drive API v3 API key — no service account required.
 *
 * Required env: GOOGLE_API_KEY
 *
 * The folder + its contained files must be set to "Anyone with the link can view".
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

function apiKey(): string {
  const key = process.env.GOOGLE_API_KEY
  if (!key) throw new Error('GOOGLE_API_KEY env var is missing')
  return key
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
  thumbnailLink?: string
}

/**
 * List all (non-trashed) files inside a public Drive folder.
 * Handles pagination automatically. Returns file metadata only — no bytes.
 */
export async function listPublicFolder(folderId: string): Promise<DriveFile[]> {
  const all: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      key: apiKey(),
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, thumbnailLink)',
      pageSize: '200',
      orderBy: 'name',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`${DRIVE_API}/files?${params}`)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Drive list failed (${res.status}): ${body.slice(0, 300)}`)
    }
    const data = await res.json() as { files?: DriveFile[]; nextPageToken?: string }
    if (data.files) all.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)

  return all
}

/**
 * Download a single Drive file's bytes via the public alt=media endpoint.
 * Only works for publicly shared files.
 */
export async function downloadPublicFile(fileId: string): Promise<Buffer> {
  const params = new URLSearchParams({
    alt: 'media',
    key: apiKey(),
  })
  const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Drive download failed for ${fileId} (${res.status}): ${body.slice(0, 300)}`)
  }
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

/**
 * Filter a list of Drive files down to image files (jpg/jpeg/png).
 * Drops the master schedule poster by filename (keeps individual flyers only).
 */
export function filterTrainingFlyers(files: DriveFile[]): DriveFile[] {
  return files.filter(f => {
    if (!/^image\/(jpe?g|png)$/i.test(f.mimeType)) return false
    // Skip the weekly schedule poster — it's a multi-event reference, not a flyer
    const lower = f.name.toLowerCase()
    if (lower.includes('weekly sched') || lower.includes('one page')) return false
    return true
  })
}
