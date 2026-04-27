import { put, del } from '@vercel/blob'

/**
 * Upload a training flyer image to Vercel Blob and return the public CDN URL.
 * Used both during Drive sync (mirroring) and manual event creation.
 *
 * Vercel Blob URLs are permanent, public, and served from a global edge CDN —
 * much more reliable than Google Drive thumbnail URLs for Discord embeds.
 */
export async function uploadFlyerToBlob(
  filename: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const blob = await put(`training-flyers/${filename}`, data, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  })
  return blob.url
}

/**
 * Delete a training flyer from Vercel Blob. Non-throwing — logs errors
 * but doesn't propagate, since blob cleanup is never critical-path.
 */
export async function deleteFlyerFromBlob(url: string): Promise<void> {
  try {
    await del(url)
  } catch (err) {
    console.error('[blob] Failed to delete flyer:', url, err)
  }
}
