import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'

// GET /api/agents/trainees/[agentCode]/partners
//
// Returns the agent's Business Partner list, read-only, when the
// caller has team-member-level access: either they recruited the
// target OR they're listed as the target's cft trainer. Anything
// else 403s. The URL keeps "trainees" for backward compat with
// existing callers; the auth model is broader (My Team unified).
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ agentCode: string }> },
) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const { agentCode } = await ctx.params
  const trainee = await authorizeTeamMemberAccess(id.profileId, agentCode)
  if (!trainee) {
    return NextResponse.json(
      { error: "You don't have access to this agent's contacts. You need to be their recruiter or assigned trainer." },
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
      timeZone: true,
      age: true,
      married: true,
      children: true,
      homeowner: true,
      occupation: true,
      characterTraits: true,
      category: true,
      status: true,
      appointmentDate: true,
      firstCallDate: true,
      secondCallDate: true,
      bookedAppt: true,
      notes: true,
      trainerNotes: true,
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
