// Helpers for the trainer view of trainees. AgentProfile.cft stores
// the trainer's name as a free-text string ("Vick Minhas", "Mercedes
// Grubb", etc.), not an FK. There's no reverse index, so finding
// "agents I'm training" means filtering on a normalized string match
// against the caller's own full name.
//
// Edge cases this normalization handles:
//   - "Vick Minhas" vs "Vick MInhas" (typo in tracker)
//   - extra spaces, casing, accidental trailing spaces
//   - empty cft (most agents don't have a trainer assigned)
//   - preferred-name vs legal-name (a trainer's cft entry is their
//     legal name on the profile; we match the trainer's legal name
//     too, not preferredName)
//
// Used by:
//   /api/agents/trainees                 — list of trainees
//   /api/agents/trainees/[code]/partners — that trainee's BP list
//   /api/agents/trainees/[code]/fta      — that trainee's FTA list

import { db } from './db'

export function normalizeName(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface TrainerContext {
  trainerProfileId: string
  trainerLegalFullName: string
  normalizedName: string
}

// Resolve the caller's "trainer identity" — the normalized legal name
// we'll compare against AgentProfile.cft on each candidate trainee.
// Returns null when the calling profile can't be resolved (caller
// should 404 in that case).
export async function loadTrainerContext(
  profileId: string,
): Promise<TrainerContext | null> {
  const me = await db.agentProfile.findUnique({
    where: { id: profileId },
    select: { firstName: true, lastName: true },
  })
  if (!me) return null
  const legalFullName = `${me.firstName} ${me.lastName}`.trim()
  return {
    trainerProfileId: profileId,
    trainerLegalFullName: legalFullName,
    normalizedName: normalizeName(legalFullName),
  }
}

// Return all AgentProfile rows where cft normalizes to the trainer's
// name. Used both to list trainees and to authorize per-trainee
// drilldowns (we re-check the target's cft inside each endpoint).
export async function findTraineeProfiles(ctx: TrainerContext) {
  if (!ctx.normalizedName) return []

  // Pull every profile that has a non-null cft and let the
  // normalizer do the comparison in app code. Doing this in Postgres
  // would require an immutable lower-trim-collapse function; the row
  // count is small enough that filtering in JS is fine.
  const candidates = await db.agentProfile.findMany({
    where: { cft: { not: null }, isTest: false },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      avatarUrl: true,
      phase: true,
      phaseStartedAt: true,
      state: true,
      status: true,
      cft: true,
    },
    orderBy: [{ status: 'asc' }, { phase: 'desc' }, { firstName: 'asc' }],
  })

  return candidates.filter(c => normalizeName(c.cft) === ctx.normalizedName)
}

// Verify that the caller (a trainer) is actually training the agent
// identified by agentCode. Returns the trainee's profile row or null
// if no match (caller should 403 in that case).
export async function authorizeTraineeAccess(
  ctx: TrainerContext,
  agentCode: string,
) {
  const trainee = await db.agentProfile.findUnique({
    where: { agentCode },
    select: { id: true, cft: true, firstName: true, lastName: true },
  })
  if (!trainee) return null
  if (normalizeName(trainee.cft) !== ctx.normalizedName) return null
  return trainee
}
