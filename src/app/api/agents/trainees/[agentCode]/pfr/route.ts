import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ agentCode: string }> },
) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const { agentCode } = await ctx.params
  const trainee = await authorizeTeamMemberAccess(id.profileId, agentCode)
  if (!trainee) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const pfr = await db.personalFinancialReview.findUnique({
    where: { agentProfileId: trainee.id },
  })

  return NextResponse.json({
    pfr,
    trainee: { firstName: trainee.firstName, lastName: trainee.lastName },
  })
}
