import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/clear-stale-errors
//
// One-shot cleanup: wipes parseError on rows that already have a valid
// discordEventId. These are rows where Discord event creation failed
// in a previous sync attempt, then later succeeded on retry — but the
// stale error string stuck around and was blocking T-15 reminders until
// we fixed the cron filter.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const result = await db.trainingEvent.updateMany({
    where: {
      discordEventId: { not: null },
      parseError: { not: null },
    },
    data: { parseError: null },
  })

  return NextResponse.json({ cleared: result.count })
}
