import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { loadTrainerContext, authorizeTraineeAccess } from '@/lib/trainer-trainees'

// GET /api/agents/trainees/[agentCode]/fta
//
// Returns the trainee's Field Training Appointment list, read-only.
// Mirror of the trainee's own /api/agents/fta view minus write
// affordances. Auth: caller's legal name must match the target
// trainee's `cft` field.
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
