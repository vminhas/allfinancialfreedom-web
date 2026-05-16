import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncAllTeamTags } from '@/lib/ghl-team-tag'

// POST /api/admin/agents/sync-ghl-team-tags
//
// Backfill the "AFF Team Member" GHL tag onto every active, non-test
// agent. Idempotent; safe to run repeatedly. Same logic the daily cron
// uses, so manual and automated runs never disagree.
export async function POST() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncAllTeamTags()
  return NextResponse.json(result)
}
