import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { celebrateMilestone } from '@/lib/milestone-celebrate'
import { MILESTONE_BY_KEY } from '@/lib/milestones'

// POST /api/vault/milestones/award
// Body: { agentProfileId: string, milestone: string, note?: string }
//
// Admin-initiated award: no agent submission required. Used when the
// LC notices the agent has earned something but hasn't submitted yet,
// or for back-fills. If a row already exists in AWARDED state we 409;
// PENDING_REVIEW or REJECTED rows get flipped to AWARDED.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const adminId = (session!.user as { id: string }).id
  const body = await req.json() as { agentProfileId?: string; milestone?: string; note?: string }
  const { agentProfileId, milestone, note } = body

  if (!agentProfileId || !milestone) {
    return NextResponse.json({ error: 'agentProfileId and milestone are required' }, { status: 400 })
  }
  if (!MILESTONE_BY_KEY[milestone]) {
    return NextResponse.json({ error: 'Unknown milestone' }, { status: 400 })
  }

  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { id: true, firstName: true, lastName: true, preferredName: true, agentCode: true, avatarUrl: true, discordUserId: true },
  })
  if (!profile) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const existing = await db.recognitionMilestone.findUnique({
    where: { agentProfileId_milestone: { agentProfileId, milestone } },
  })
  if (existing && existing.status === 'AWARDED') {
    return NextResponse.json({ error: 'Already awarded' }, { status: 409 })
  }

  const now = new Date()
  const row = await db.recognitionMilestone.upsert({
    where: { agentProfileId_milestone: { agentProfileId, milestone } },
    update: {
      status: 'AWARDED',
      completedAt: now,
      reviewedAt: now,
      reviewerAdminId: adminId,
      reviewNote: note ?? null,
    },
    create: {
      agentProfileId,
      milestone,
      status: 'AWARDED',
      completedAt: now,
      reviewedAt: now,
      reviewerAdminId: adminId,
      reviewNote: note ?? null,
    },
  })

  celebrateMilestone({ milestoneKey: milestone, agent: profile }).catch(() => {})
  return NextResponse.json({ milestone: row })
}
