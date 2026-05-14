import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/admin/tevah-sync/purge
// Deletes all submissions that were imported via the Tevah sync (tevahClientId IS NOT NULL).
// Use this to clear bad historical imports before re-running the sync with corrected logic.
export async function POST() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.newBusinessSubmission.deleteMany({
    where: { tevahClientId: { not: null } },
  })

  return NextResponse.json({ ok: true, deleted: result.count })
}
