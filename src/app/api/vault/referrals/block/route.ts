import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/vault/referrals/block
//   body: { referringAgentId, blocked, reason?, purgePending? }
//
// Admin-only. Flips AgentProfile.referralsBlockedAt to NOW (or null
// to unblock). When `purgePending: true`, also deletes every PENDING
// referral the agent has on the queue in the same call — the
// one-click "stop the bleeding" path for an active spammer.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    referringAgentId?: string
    blocked?: boolean
    reason?: string
    purgePending?: boolean
  }
  if (!body.referringAgentId) {
    return NextResponse.json({ error: 'referringAgentId required' }, { status: 400 })
  }

  const agent = await db.agentProfile.findUnique({
    where: { id: body.referringAgentId },
    select: { id: true, firstName: true, lastName: true, agentCode: true },
  })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const blocked = !!body.blocked
  await db.agentProfile.update({
    where: { id: agent.id },
    data: {
      referralsBlockedAt: blocked ? new Date() : null,
      referralsBlockedReason: blocked ? (body.reason?.trim() || 'Flagged by admin') : null,
    },
  })

  // Purge runs independent of the block flag so admins can clean up
  // an agent's spam queue while leaving them able to submit real
  // referrals going forward (the common case after Mel-style training
  // misuse, not a true attack).
  let purged = 0
  if (body.purgePending) {
    const r = await db.agentReferral.deleteMany({
      where: { referringAgentId: agent.id, status: 'PENDING' },
    })
    purged = r.count
  }

  return NextResponse.json({
    ok: true,
    blocked,
    purgedPending: purged,
    agent: { id: agent.id, name: `${agent.firstName} ${agent.lastName}`, agentCode: agent.agentCode },
  })
}
