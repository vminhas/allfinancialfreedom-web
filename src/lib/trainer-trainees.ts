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
      // passwordHash drives the "on the portal yet" signal so a CFT can
      // tell whether a trainee has actually logged in (ACTIVE) vs only
      // been invited (INVITED).
      agentUser: { select: { id: true, passwordHash: true, email: true, createdAt: true } },
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

// Broader authorization used by the unified My Team drill-down:
// access granted when the caller is either (a) the agent's recruiter
// or (b) listed as the agent's cft trainer. Lets a recruiter drill
// into anyone they brought on AND a trainer drill into anyone they're
// training, even if those two groups don't overlap.
export async function authorizeTeamMemberAccess(
  callerProfileId: string,
  agentCode: string,
) {
  const [caller, target] = await Promise.all([
    db.agentProfile.findUnique({
      where: { id: callerProfileId },
      select: { agentCode: true, firstName: true, lastName: true, preferredName: true },
    }),
    db.agentProfile.findUnique({
      where: { agentCode },
      select: { id: true, recruiterId: true, cft: true, firstName: true, lastName: true },
    }),
  ])
  if (!caller || !target) return null

  // Recruiter path: AgentProfile.recruiterId stores the recruiter's
  // agentCode (per CLAUDE.md). Direct upline.
  if (target.recruiterId && target.recruiterId.toUpperCase() === caller.agentCode.toUpperCase()) {
    return target
  }

  // Trainer path: cft normalization match (same logic as the trainee
  // endpoints, with preferred-name support).
  const accepted = new Set<string>()
  const legal = normalizeName(`${caller.firstName} ${caller.lastName}`)
  if (legal) accepted.add(legal)
  if (caller.preferredName?.trim()) {
    const preferred = normalizeName(`${caller.preferredName.trim()} ${caller.lastName}`)
    if (preferred) accepted.add(preferred)
  }
  if (accepted.has(normalizeName(target.cft))) return target

  return null
}

// Authorization for the leadership agent-notes feature. Broader than
// authorizeTeamMemberAccess: a note about an agent can be written/read
// by ANYONE in that agent's upline (the full recruiter chain, not just
// the direct recruiter) plus their trainer. The subject agent
// themselves is never authorized here (notes are hidden from them).
// Returns the target {id, firstName, lastName} when allowed, else null.
export async function authorizeUplineNotesAccess(
  callerProfileId: string,
  agentCode: string,
) {
  const [caller, target] = await Promise.all([
    db.agentProfile.findUnique({
      where: { id: callerProfileId },
      select: { agentCode: true, firstName: true, lastName: true, preferredName: true },
    }),
    db.agentProfile.findUnique({
      where: { agentCode },
      select: { id: true, agentCode: true, recruiterId: true, cft: true, firstName: true, lastName: true },
    }),
  ])
  if (!caller || !target) return null
  // The subject can never read/write notes about themselves.
  if (caller.agentCode.toUpperCase() === target.agentCode.toUpperCase()) return null

  const callerCode = caller.agentCode.toUpperCase()

  // Walk the recruiter chain upward from the target. recruiterId stores
  // the recruiter's agentCode (per CLAUDE.md). Bounded + cycle-guarded
  // so a bad recruiterId loop can't spin forever.
  let cursor = target.recruiterId
  const seen = new Set<string>()
  for (let hops = 0; cursor && hops < 50; hops++) {
    const code = cursor.toUpperCase()
    if (code === callerCode) return target
    if (seen.has(code)) break
    seen.add(code)
    const up = await db.agentProfile.findUnique({
      where: { agentCode: cursor },
      select: { recruiterId: true },
    })
    if (!up) break
    cursor = up.recruiterId
  }

  // Trainer path: cft normalization match (same logic as the other
  // team-access helpers, with preferred-name support).
  const accepted = new Set<string>()
  const legal = normalizeName(`${caller.firstName} ${caller.lastName}`)
  if (legal) accepted.add(legal)
  if (caller.preferredName?.trim()) {
    const preferred = normalizeName(`${caller.preferredName.trim()} ${caller.lastName}`)
    if (preferred) accepted.add(preferred)
  }
  if (accepted.has(normalizeName(target.cft))) return target

  return null
}
