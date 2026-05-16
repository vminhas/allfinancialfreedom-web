import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { loadTrainerContext, findTraineeProfiles } from '@/lib/trainer-trainees'

// GET /api/agents/trainees
//
// Returns the list of AgentProfile rows whose `cft` field normalizes
// to the caller's legal name. Powers the "My Trainees" tab in the
// agent portal.
//
// For each trainee we also include lightweight counts (Business
// Partners + FTAs) so the trainer can see "who has something to
// review" at a glance without expanding every row.
//
// Auth: agent session (resolveAgentIdentity).
export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const ctx = await loadTrainerContext(id.profileId)
  if (!ctx) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const trainees = await findTraineeProfiles(ctx)
  if (trainees.length === 0) {
    return NextResponse.json({ trainees: [], trainerName: ctx.trainerLegalFullName })
  }

  // Batch the counts so we don't N+1 the per-trainee row.
  const ids = trainees.map(t => t.id)
  const [partnerCounts, ftaCounts] = await Promise.all([
    db.businessPartner.groupBy({
      by: ['agentProfileId'],
      where: { agentProfileId: { in: ids } },
      _count: { _all: true },
    }),
    db.fieldTrainingAppointment.groupBy({
      by: ['agentProfileId'],
      where: { agentProfileId: { in: ids } },
      _count: { _all: true },
    }),
  ])

  const bpByAgent = new Map(partnerCounts.map(r => [r.agentProfileId, r._count._all]))
  const ftaByAgent = new Map(ftaCounts.map(r => [r.agentProfileId, r._count._all]))

  return NextResponse.json({
    trainerName: ctx.trainerLegalFullName,
    trainees: trainees.map(t => ({
      id: t.id,
      agentCode: t.agentCode,
      firstName: t.firstName,
      lastName: t.lastName,
      preferredName: t.preferredName,
      avatarUrl: t.avatarUrl,
      phase: t.phase,
      phaseStartedAt: t.phaseStartedAt?.toISOString() ?? null,
      state: t.state,
      status: t.status,
      partnerCount: bpByAgent.get(t.id) ?? 0,
      ftaCount: ftaByAgent.get(t.id) ?? 0,
    })),
  })
}
