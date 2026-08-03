import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/agents/resolve-trainer?recruiterCode=XXXX
//
// Walks up the recruiter chain from the given agentCode and returns
// the first agent who qualifies as a Certified Field Trainer:
//
//   isLeadership: true   — always a valid trainer (Vick / Melinee)
//   phase >= 3 AND isReferralPartner: false  — CFT / MD / EMD / above
//
// This implements the org rule: a new agent's trainer is whoever in
// their upline first reaches CFT rank. If the direct recruiter is
// already a CFT, they are the trainer. If not, we walk up until we
// find one — the same CFT who trained the intermediate leg owns the
// new recruit's training.
//
// Returns: { trainerName: string | null, agentCode: string | null }
// trainerName is the display name stored in the `cft` column (free-text).

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const recruiterCode = new URL(req.url).searchParams.get('recruiterCode')?.trim()
  if (!recruiterCode) {
    return NextResponse.json({ trainerName: null, agentCode: null })
  }

  const MAX_DEPTH = 15
  let currentCode = recruiterCode

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const agent = await db.agentProfile.findFirst({
      where: { agentCode: { equals: currentCode, mode: 'insensitive' } },
      select: {
        agentCode: true,
        firstName: true,
        lastName: true,
        phase: true,
        isReferralPartner: true,
        isLeadership: true,
        recruiterId: true,
      },
    })

    if (!agent) break

    const isCft = agent.isLeadership || (agent.phase >= 3 && !agent.isReferralPartner)
    if (isCft) {
      return NextResponse.json({
        trainerName: `${agent.firstName} ${agent.lastName}`,
        agentCode: agent.agentCode,
      })
    }

    // Not a CFT yet — walk up to their recruiter
    if (!agent.recruiterId) break
    currentCode = agent.recruiterId
  }

  return NextResponse.json({ trainerName: null, agentCode: null })
}
