import { NextRequest, NextResponse } from 'next/server'
import { syncAllTeamTags } from '@/lib/ghl-team-tag'

// GET /api/cron/sync-ghl-team-tags
//
// Daily safety re-sync: ensures every active agent's GHL contact still
// carries the "AFF Team Member" tag, so a silently-failed tagging at
// onboarding self-heals. Idempotent; already-tagged contacts cost one
// read and are skipped.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncAllTeamTags()
  return NextResponse.json(result)
}
