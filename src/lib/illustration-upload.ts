import { put, del } from '@vercel/blob'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export function validateIllustration(file: { size: number; type: string }): string | null {
  if (file.size > MAX_SIZE) return 'File exceeds 10 MB limit'
  if (!ALLOWED.has(file.type)) return `Unsupported file type: ${file.type}`
  return null
}

export async function uploadIllustrationToBlob(
  submissionId: string,
  filename: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const blob = await put(`illustrations/${submissionId}/${filename}`, data, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  })
  return blob.url
}

export async function deleteIllustrationFromBlob(url: string): Promise<void> {
  try {
    await del(url)
  } catch (err) {
    console.error('[blob] Failed to delete illustration:', url, err)
  }
}
