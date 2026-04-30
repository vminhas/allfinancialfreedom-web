import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { celebrateMilestone } from '@/lib/milestone-celebrate'

// POST /api/vault/milestones/[id]/review
// Body: { action: 'approve' | 'reject', reviewNote?: string }
//
// Approve: set status=AWARDED, stamp completedAt+reviewedAt, fire the
//          Discord celebration.
// Reject:  set status=REJECTED, stamp reviewedAt, optionally store
//          reviewNote so the agent sees why. No DM.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const adminId = (session!.user as { id: string }).id
  const { id } = await ctx.params
  const body = await req.json() as { action?: string; reviewNote?: string }
  const action = body.action

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  const row = await db.recognitionMilestone.findUnique({
    where: { id },
    include: { agentProfile: { select: { firstName: true, lastName: true, discordUserId: true } } },
  })
  if (!row) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
  if (row.status !== 'PENDING_REVIEW') {
    return NextResponse.json({ error: `Already ${row.status.toLowerCase()}` }, { status: 409 })
  }

  const now = new Date()
  if (action === 'approve') {
    const updated = await db.recognitionMilestone.update({
      where: { id },
      data: {
        status: 'AWARDED',
        completedAt: now,
        reviewedAt: now,
        reviewerAdminId: adminId,
        reviewNote: body.reviewNote ?? null,
      },
    })
    celebrateMilestone({ milestoneKey: row.milestone, agent: row.agentProfile }).catch(() => {})
    return NextResponse.json({ milestone: updated })
  }

  // reject
  const updated = await db.recognitionMilestone.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedAt: now,
      reviewerAdminId: adminId,
      reviewNote: body.reviewNote ?? null,
    },
  })
  return NextResponse.json({ milestone: updated })
}
