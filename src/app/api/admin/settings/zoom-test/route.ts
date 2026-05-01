import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { clearZoomTokenCache, testZoomCredentials } from '@/lib/zoom'

// Used by the "Test connection" button on /vault/settings. Clears the
// in-process token cache so we always do a fresh OAuth exchange,
// then hits a cheap Zoom endpoint to confirm the creds + scopes work.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  clearZoomTokenCache()
  const result = await testZoomCredentials()
  return NextResponse.json(result)
}
