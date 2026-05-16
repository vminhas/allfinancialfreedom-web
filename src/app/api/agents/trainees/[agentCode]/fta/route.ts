import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'

// GET /api/agents/trainees/[agentCode]/fta
//
// Returns the agent's FTA list, read-only. Auth: caller must be the
// agent's recruiter OR their assigned cft trainer. URL keeps the
// "trainees" segment for backward compat with the My Trainees tab
// that's now merged into My Team.
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

  const ftas = await db.fieldTrainingAppointment.findMany({
    where: { agentProfileId: trainee.id },
    orderBy: { appointmentDate: 'desc' },
    include: {
      businessPartner: {
        select: { id: true, name: true, phone: true, email: true, occupation: true, category: true },
      },
    },
  })

  return NextResponse.json({
    trainee: {
      id: trainee.id,
      agentCode,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
    },
    ftas,
  })
}
