import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { loadTrainerContext, authorizeTraineeAccess } from '@/lib/trainer-trainees'

// GET /api/agents/trainees/[agentCode]/partners
//
// Returns the trainee's Business Partner list, read-only. The trainer
// view of the same data the trainee sees in their own CRM tab.
//
// Authorization: caller must be a signed-in agent whose legal name
// matches the target trainee's `cft` field. Anything else 403s; we
// never want a random agent pulling another agent's contacts.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ agentCode: string }> },
) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const tctx = await loadTrainerContext(id.profileId)
  if (!tctx) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { agentCode } = await ctx.params
  const trainee = await authorizeTraineeAccess(tctx, agentCode)
  if (!trainee) {
    return NextResponse.json(
      { error: "You aren't listed as this agent's trainer." },
      { status: 403 },
    )
  }

  const partners = await db.businessPartner.findMany({
    where: { agentProfileId: trainee.id },
    orderBy: { createdAt: 'asc' },
    // Same fields the trainee sees on their own CRM, minus the
    // linkedAgentProfile NPN/license expansion which is only useful
    // when the trainer is also writing apps. Trainer view is for
    // coaching, not for pulling NPNs.
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      category: true,
      status: true,
      notes: true,
      occupation: true,
      age: true,
      lastContactAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    trainee: {
      id: trainee.id,
      agentCode,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
    },
    partners,
  })
}
