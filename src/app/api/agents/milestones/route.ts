import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSubmittable } from '@/lib/milestones'

async function getAgentProfile() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') return null
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) return null
  return db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true, firstName: true, lastName: true },
  })
}

// POST /api/agents/milestones
// Body: { milestone: string, note?: string }
//
// Agent self-attests they've earned a submission-typed milestone. We
// upsert a PENDING_REVIEW row for the LC to review. Re-submitting after
// a rejection re-uses the row (status flips back to PENDING_REVIEW).
// AWARDED is terminal; we 409 to prevent duplicate work.
export async function POST(req: NextRequest) {
  const profile = await getAgentProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { milestone?: string; note?: string }
  const milestone = body.milestone
  if (!milestone || !isSubmittable(milestone)) {
    return NextResponse.json({ error: 'Milestone is not submittable' }, { status: 400 })
  }

  const existing = await db.recognitionMilestone.findUnique({
    where: { agentProfileId_milestone: { agentProfileId: profile.id, milestone } },
  })
  if (existing?.status === 'AWARDED') {
    return NextResponse.json({ error: 'Already awarded' }, { status: 409 })
  }
  if (existing?.status === 'PENDING_REVIEW') {
    return NextResponse.json({ error: 'Already submitted; awaiting review' }, { status: 409 })
  }

  const now = new Date()
  const row = await db.recognitionMilestone.upsert({
    where: { agentProfileId_milestone: { agentProfileId: profile.id, milestone } },
    update: {
      status: 'PENDING_REVIEW',
      requestedAt: now,
      requestNote: (body.note ?? '').trim() || null,
      // Clear prior rejection metadata when re-submitting.
      reviewedAt: null,
      reviewerAdminId: null,
      reviewNote: null,
    },
    create: {
      agentProfileId: profile.id,
      milestone,
      status: 'PENDING_REVIEW',
      requestedAt: now,
      requestNote: (body.note ?? '').trim() || null,
    },
  })

  // Light-weight admin ping so the LC sees new submissions without
  // having to refresh the vault page.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const { sendChannelMessage } = await import('@/lib/discord')
    sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
      content: `🏅 **${profile.firstName} ${profile.lastName}** submitted **${milestone}** for milestone review. Open /vault/milestones to approve or reject.`,
    }).catch(() => {})
  }

  return NextResponse.json({ milestone: row })
}
