// Helpers for the trainer view of trainees. AgentProfile.cft stores
// the trainer's name as a free-text string ("Vick Minhas", "Mercedes
// Grubb", etc.), not an FK. There's no reverse index, so finding
// "agents I'm training" means filtering on a normalized string match
// against the caller's own name(s).
//
// Edge cases the normalization handles:
//   - "Vick Minhas" vs "Vick MInhas" (typo in tracker)
//   - extra spaces, casing, accidental trailing spaces
//   - empty cft (most agents don't have a trainer assigned)
//   - preferred-name vs legal-name. A trainer whose legal first name
//     is "Karmvir" but who is universally called "Vick" will have
//     preferredName="Vick" on their profile, and every other agent's
//     `cft` string will say "Vick Minhas". We try BOTH the legal full
//     name AND the preferred-name form so the match works regardless
//     of which one a tracker user typed in.
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
  // Every name variant we'll accept on a trainee's cft field. Always
  // includes the legal "First Last" form and, if preferredName is on
  // file, also "Preferred Last". Both stored pre-normalized so the
  // matcher just does a Set.has() check.
  acceptedNames: Set<string>
}

export async function loadTrainerContext(
  profileId: string,
): Promise<TrainerContext | null> {
  const me = await db.agentProfile.findUnique({
    where: { id: profileId },
    select: { firstName: true, lastName: true, preferredName: true },
  })
  if (!me) return null

  const legalFullName = `${me.firstName} ${me.lastName}`.trim()
  const accepted = new Set<string>()
  const legal = normalizeName(legalFullName)
  if (legal) accepted.add(legal)

  // Also accept the preferred-name form. Two real cases this catches:
  //   1. The CEO: legal "Karmvir Minhas", preferred "Vick", and every
  //      cft on a profile reads "Vick Minhas".
  //   2. Anyone who later set a preferredName in their portal profile
  //      after agents already typed their preferred form into cft.
  if (me.preferredName?.trim()) {
    const preferred = normalizeName(`${me.preferredName.trim()} ${me.lastName}`)
    if (preferred) accepted.add(preferred)
  }

  return {
    trainerProfileId: profileId,
    trainerLegalFullName: legalFullName,
    acceptedNames: accepted,
  }
}

export async function findTraineeProfiles(ctx: TrainerContext) {
  if (ctx.acceptedNames.size === 0) return []

  // Pull every profile with a non-null cft and let the normalizer do
  // the comparison in app code. Doing this in Postgres would require
  // an immutable lower-trim-collapse function; row count is small
  // enough that filtering in JS is fine.
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

  return candidates.filter(c => ctx.acceptedNames.has(normalizeName(c.cft)))
}

export async function authorizeTraineeAccess(
  ctx: TrainerContext,
  agentCode: string,
) {
  const trainee = await db.agentProfile.findUnique({
    where: { agentCode },
    select: { id: true, cft: true, firstName: true, lastName: true },
  })
  if (!trainee) return null
  if (!ctx.acceptedNames.has(normalizeName(trainee.cft))) return null
  return trainee
}
