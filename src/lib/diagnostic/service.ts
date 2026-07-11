// Server-side helpers for the Success Diagnostic: persistence, loading a row
// into the typed StoredDiagnostic shape the access serializers expect, and
// resolving which downline results an agent is allowed to coach on.

import { db } from '@/lib/db'
import { normalizeName } from '@/lib/trainer-trainees'
import type { StoredDiagnostic } from './access'
import type { ScoredResult, DiagnosticClass, DiagnosticRisk, ModuleScore, Probabilities } from './scoring'
import { DIAGNOSTIC_VERSION } from './questions'
import type { Answers } from './scoring'

export interface SubmitInput {
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  company?: string | null
  state?: string | null
  subjectProfileId?: string | null
  recruiterCode?: string | null
  recruiterName?: string | null
  source: string
  answers: Answers
  ipAddress?: string | null
  userAgent?: string | null
  pageUrl?: string | null
}

// Persist a freshly scored result. Returns the new row id.
export async function persistScored(input: SubmitInput, scored: ScoredResult): Promise<string> {
  const row = await db.diagnosticResult.create({
    data: {
      status: 'COMPLETED',
      submittedAt: new Date(),
      version: DIAGNOSTIC_VERSION,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      company: input.company ?? null,
      state: input.state ?? null,
      subjectProfileId: input.subjectProfileId ?? null,
      recruiterCode: input.recruiterCode ?? null,
      recruiterName: input.recruiterName ?? null,
      source: input.source,
      overallScore: scored.overallScore,
      overallClass: scored.overallClass,
      risk: scored.risk,
      limitingModule: scored.limitingModule,
      recommendedFocus: scored.recommendedFocus,
      moduleScores: scored.modules as unknown as object,
      probabilities: scored.probabilities as unknown as object,
      consistencyIndex: scored.consistency.index,
      consistencyPenaltyPct: scored.consistency.penaltyPct,
      consistencyLabel: scored.consistency.label,
      answers: input.answers as unknown as object,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      pageUrl: input.pageUrl ?? null,
    },
    select: { id: true },
  })
  return row.id
}

// Cast a Prisma row into the StoredDiagnostic shape (JSON columns are typed
// loosely by Prisma; we know their shape because we wrote them).
type RawRow = {
  id: string; createdAt: Date; submittedAt: Date | null; status: string; version: number
  firstName: string; lastName: string; email: string; phone: string | null
  company: string | null; state: string | null; subjectProfileId: string | null
  recruiterCode: string | null; recruiterName: string | null; source: string
  overallScore: number; overallClass: DiagnosticClass; risk: DiagnosticRisk
  limitingModule: string; recommendedFocus: string
  moduleScores: unknown; probabilities: unknown
  consistencyIndex: number; consistencyPenaltyPct: number; consistencyLabel: string
  answers?: unknown
}

export function toStored(row: RawRow): StoredDiagnostic {
  return {
    ...row,
    moduleScores: (row.moduleScores as ModuleScore[]) ?? [],
    probabilities: (row.probabilities as Probabilities) ?? { licensing: 0, retention: 0, network: 0, leadership: 0 },
    answers: (row.answers as Record<string, number> | undefined) ?? null,
  }
}

export async function loadStored(id: string): Promise<StoredDiagnostic | null> {
  const row = await db.diagnosticResult.findUnique({ where: { id } })
  return row ? toStored(row as RawRow) : null
}

// The set of AgentProfile ids whose diagnostic results a given agent may coach
// on: their full downline (walking recruiterId, which stores the recruiter's
// agentCode) plus anyone whose cft trainer name matches the caller. Excludes
// the caller themselves (their own result is fetched separately). Mirrors the
// traversal in /api/agents/team.
export async function collectTeamProfileIds(callerProfileId: string): Promise<Set<string>> {
  const caller = await db.agentProfile.findUnique({
    where: { id: callerProfileId },
    select: { agentCode: true, firstName: true, lastName: true, preferredName: true },
  })
  if (!caller) return new Set()

  const all = await db.agentProfile.findMany({
    where: { isTest: false },
    select: { id: true, agentCode: true, recruiterId: true, cft: true },
  })

  const byCode = new Map<string, (typeof all)[number]>()
  const childrenOf = new Map<string, (typeof all)[number][]>()
  for (const p of all) {
    byCode.set(p.agentCode.toUpperCase(), p)
    const rid = p.recruiterId?.toUpperCase()
    if (rid) {
      const arr = childrenOf.get(rid) ?? []
      arr.push(p)
      childrenOf.set(rid, arr)
    }
  }

  const teamIds = new Set<string>()
  // BFS the downline from the caller's agentCode.
  const queue = [caller.agentCode.toUpperCase()]
  const visited = new Set<string>(queue)
  while (queue.length) {
    const code = queue.shift()!
    for (const child of childrenOf.get(code) ?? []) {
      if (visited.has(child.agentCode.toUpperCase())) continue
      visited.add(child.agentCode.toUpperCase())
      teamIds.add(child.id)
      queue.push(child.agentCode.toUpperCase())
    }
  }

  // Trainer path: anyone whose cft normalizes to one of the caller's names.
  const accepted = new Set<string>()
  const legal = normalizeName(`${caller.firstName} ${caller.lastName}`)
  if (legal) accepted.add(legal)
  if (caller.preferredName?.trim()) {
    const pref = normalizeName(`${caller.preferredName.trim()} ${caller.lastName}`)
    if (pref) accepted.add(pref)
  }
  if (accepted.size) {
    for (const p of all) {
      if (p.cft && accepted.has(normalizeName(p.cft))) teamIds.add(p.id)
    }
  }

  teamIds.delete(callerProfileId)
  return teamIds
}
