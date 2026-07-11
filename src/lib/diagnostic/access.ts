// Access tiers for a diagnostic result.
//
// Three audiences see three different projections of the same row. This is
// the single place that decides what each audience is allowed to see, so a
// sensitive field can never leak by being forgotten in one endpoint.
//
//   subject   the person who took it (their own report). Positive framing:
//             score, class, modules, limiting factor, focus, probabilities.
//             NOT shown: the internal risk/wash-out label, the raw
//             consistency index + penalty mechanics, raw answers.
//
//   coaching  an upline recruiter or trainer viewing a downline member. Built
//             for day-to-day coaching: score, class, the 10-module breakdown,
//             the #1 limiting factor, the recommended focus, and completion
//             date. NOT shown (vault-only): risk level, the four probability
//             indicators, the honesty/consistency check, raw answers, and full
//             contact PII beyond the name.
//
//   vault     admin / licensing coordinator. Everything, including risk, the
//             probability indicators, the consistency/integrity check, raw
//             answers, attribution, and full PII.
//
// The API layer decides which tier a viewer gets (see resolveTier notes in the
// route); this module only performs the projection.

import { MODULE_BY_KEY, type ModuleKey } from './questions'
import type { DiagnosticClass, DiagnosticRisk, ModuleScore, Probabilities } from './scoring'
import { CLASS_LABEL } from './scoring'

export type Tier = 'subject' | 'coaching' | 'vault'

// The persisted shape this module projects from (mirrors the Prisma row; kept
// as a plain interface so callers can pass a lean `select`).
export interface StoredDiagnostic {
  id: string
  createdAt: Date
  submittedAt: Date | null
  status: string
  version: number
  firstName: string
  lastName: string
  email: string
  phone: string | null
  company: string | null
  state: string | null
  subjectProfileId: string | null
  recruiterCode: string | null
  recruiterName: string | null
  source: string
  overallScore: number
  overallClass: DiagnosticClass
  risk: DiagnosticRisk
  limitingModule: string
  recommendedFocus: string
  moduleScores: ModuleScore[]
  probabilities: Probabilities
  consistencyIndex: number
  consistencyPenaltyPct: number
  consistencyLabel: string
  answers?: Record<string, number> | null
}

function limitingName(key: string): string {
  return MODULE_BY_KEY[key as ModuleKey]?.name ?? key
}

// ---- subject (own report) -------------------------------------------------
export interface SubjectView {
  id: string
  name: string
  completedAt: Date | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
  probabilities: Probabilities
  consistencyLabel: string
}

export function toSubjectView(r: StoredDiagnostic): SubjectView {
  return {
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    completedAt: r.submittedAt,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    modules: r.moduleScores,
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
    recommendedFocus: r.recommendedFocus,
    probabilities: r.probabilities,
    consistencyLabel: r.consistencyLabel,
  }
}

// ---- coaching (upline / trainer) ------------------------------------------
export interface CoachingView {
  id: string
  name: string
  state: string | null
  completedAt: Date | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
}

export function toCoachingView(r: StoredDiagnostic): CoachingView {
  return {
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    state: r.state,
    completedAt: r.submittedAt,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    modules: r.moduleScores,
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
    recommendedFocus: r.recommendedFocus,
  }
}

// A compact row for the agent portal team list (coaching tier).
export interface CoachingListItem {
  id: string
  name: string
  completedAt: Date | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  limitingModule: string
  limitingModuleName: string
}

export function toCoachingListItem(r: StoredDiagnostic): CoachingListItem {
  return {
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    completedAt: r.submittedAt,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
  }
}

// ---- vault (admin / LC) ---------------------------------------------------
export interface VaultView extends CoachingView {
  createdAt: Date
  status: string
  version: number
  email: string
  phone: string | null
  company: string | null
  source: string
  recruiterCode: string | null
  recruiterName: string | null
  risk: DiagnosticRisk
  probabilities: Probabilities
  consistencyIndex: number
  consistencyPenaltyPct: number
  consistencyLabel: string
}

export function toVaultView(r: StoredDiagnostic): VaultView {
  return {
    ...toCoachingView(r),
    createdAt: r.createdAt,
    status: r.status,
    version: r.version,
    email: r.email,
    phone: r.phone,
    company: r.company,
    source: r.source,
    recruiterCode: r.recruiterCode,
    recruiterName: r.recruiterName,
    risk: r.risk,
    probabilities: r.probabilities,
    consistencyIndex: r.consistencyIndex,
    consistencyPenaltyPct: r.consistencyPenaltyPct,
    consistencyLabel: r.consistencyLabel,
  }
}

// A compact row for the vault list (full tier), including the sensitive
// fields the vault is allowed to sort / group / filter on.
export interface VaultListItem {
  id: string
  createdAt: Date
  completedAt: Date | null
  status: string
  name: string
  email: string
  state: string | null
  source: string
  recruiterCode: string | null
  recruiterName: string | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  risk: DiagnosticRisk
  limitingModule: string
  limitingModuleName: string
  licensingProbability: number
}

export function toVaultListItem(r: StoredDiagnostic): VaultListItem {
  return {
    id: r.id,
    createdAt: r.createdAt,
    completedAt: r.submittedAt,
    status: r.status,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    state: r.state,
    source: r.source,
    recruiterCode: r.recruiterCode,
    recruiterName: r.recruiterName,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    risk: r.risk,
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
    licensingProbability: r.probabilities?.licensing ?? 0,
  }
}

export function projectForTier(r: StoredDiagnostic, tier: Tier): SubjectView | CoachingView | VaultView {
  if (tier === 'vault') return toVaultView(r)
  if (tier === 'coaching') return toCoachingView(r)
  return toSubjectView(r)
}
