import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

// GET /api/agents/recruits/search?q=<name|agentCode>
//
// Powers the "Pick existing recruit" autocomplete on the direct_N
// phase items. Searches every AgentProfile (active AND inactive — the
// recruiter still gets credit for someone they brought into AFF even
// if that person later went inactive), excluding test accounts and
// the caller themselves.
//
// Each result includes a `claimState` hint so the picker can render
// visual cues:
//   ok        — recruiterId is unset; clean claim path
//   yours     — already linked to the caller's agentCode (informational)
//   conflict  — recruiterId is set to a different recruiter (warn-and-allow)
//
// Inactive agents are flagged separately via `status` so the picker
// can fade their row.
export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ recruits: [] })

  const me = await db.agentProfile.findUnique({
    where: { id: id.profileId },
    select: { id: true, agentCode: true },
  })
  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const matches = await db.agentProfile.findMany({
    where: {
      isTest: false,
      id: { not: me.id },
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName:  { contains: q, mode: 'insensitive' } },
        { agentCode: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      agentCode: true,
      avatarUrl: true,
      phase: true,
      status: true,
      recruiterId: true,
    },
    orderBy: [{ status: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    take: 20,
  })

  const recruits = matches.map(m => {
    let claimState: 'ok' | 'yours' | 'conflict' = 'ok'
    if (m.recruiterId === me.agentCode) claimState = 'yours'
    else if (m.recruiterId && m.recruiterId !== me.agentCode) claimState = 'conflict'
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      agentCode: m.agentCode,
      avatarUrl: m.avatarUrl,
      phase: m.phase,
      status: m.status, // ACTIVE | INACTIVE
      claimState,
      currentRecruiterCode: m.recruiterId,
    }
  })

  return NextResponse.json({ recruits })
}
