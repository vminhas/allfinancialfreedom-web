import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'

// GET /api/agents/trainees/[agentCode]/pfr
//
// Read-only Personal Financial Review for a downline / trainee agent.
// Same team-member auth as the contacts drill-down: the caller must be
// the agent's recruiter or assigned trainer. Returns { pfr: null } (200)
// when the agent never started one so the UI can render a "not started"
// state and offer the reminder action instead of erroring.
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
      { error: "You don't have access to this agent's PFR. You need to be their recruiter or assigned trainer." },
      { status: 403 },
    )
  }

  const pfr = await db.personalFinancialReview.findUnique({
    where: { agentProfileId: trainee.id },
    select: {
      monthlyIncome: true,
      expenses: true,
      assets: true,
      debts: true,
      buckets: true,
      retirementAge: true,
      spouseRetAge: true,
      desiredMonthlyRetirement: true,
      monthlySavingsCommitment: true,
      whatWouldThisDo: true,
      whatIsStopping: true,
      dreamsAndGoals: true,
      notes: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    trainee: {
      id: trainee.id,
      agentCode,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
    },
    pfr: pfr ?? null,
  })
}
