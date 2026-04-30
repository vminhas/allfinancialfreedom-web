import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/vault/milestones
// Returns every RecognitionMilestone row with the associated agent
// summary, so the vault page can render a queue grouped by status.
// We don't filter here; the page handles the bucketing client-side.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const rows = await db.recognitionMilestone.findMany({
    include: {
      agentProfile: {
        select: { id: true, firstName: true, lastName: true, agentCode: true, phase: true, discordUserId: true },
      },
      reviewer: { select: { name: true } },
    },
    orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }, { completedAt: 'desc' }],
  })

  return NextResponse.json({ milestones: rows })
}
