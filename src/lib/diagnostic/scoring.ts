// AFF Success Diagnostic scoring.
//
// Fully transparent and tunable (unlike the source tool, whose formula lived
// in an external service). Given the raw answers, this produces the module
// scores, the 800-point overall, class bands, the honesty/consistency check,
// the four probability indicators, and the limiting factor. Every number here
// is derived in code we control.
//
// Answer encoding (see questions.ts):
//   scale     -> integer 1..7
//   frequency -> integer 0..4 (bucket index into FREQUENCY_OPTIONS)
//   choice    -> integer option index (0-based) into the question's options

import {
  QUESTIONS, MODULES, MODULE_BY_KEY, QUESTION_BY_KEY, TOTAL_QUESTIONS,
  type ModuleKey, type Question,
} from './questions'

export type Answers = Record<string, number>

// Class bands + risk tiers. These string values are also the Prisma enum
// values, so keep them in sync with the DiagnosticClass / DiagnosticRisk
// enums in schema.prisma.
export const DIAGNOSTIC_CLASSES = ['ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE'] as const
export type DiagnosticClass = (typeof DIAGNOSTIC_CLASSES)[number]

export const DIAGNOSTIC_RISKS = ['NEEDS_IMPROVEMENT', 'MODERATE', 'ON_TRACK', 'STRONG'] as const
export type DiagnosticRisk = (typeof DIAGNOSTIC_RISKS)[number]

export const CLASS_LABEL: Record<DiagnosticClass, string> = {
  ENTRY: 'Entry', EMERGING: 'Emerging', DEVELOPING: 'Developing', ADVANCED: 'Advanced', ELITE: 'Elite',
}
export const RISK_LABEL: Record<DiagnosticRisk, string> = {
  NEEDS_IMPROVEMENT: 'Needs improvement', MODERATE: 'Moderate', ON_TRACK: 'On track', STRONG: 'Strong',
}

export const MAX_OVERALL = 800

// Module % -> class band. Modules stay on our own transparent 0..100 scale
// (they are not individually calibrated to the source tool).
export function classForPct(pct: number): DiagnosticClass {
  if (pct >= 85) return 'ELITE'
  if (pct >= 75) return 'ADVANCED'
  if (pct >= 65) return 'DEVELOPING'
  if (pct >= 55) return 'EMERGING'
  return 'ENTRY'
}

// --- Calibration to the source (Siebold) scale --------------------------------
// The source diagnostic scores through an undocumented external engine. To land
// our overall number on the same 800-point scale, we submitted 11 controlled
// answer vectors to the real assessment (floor, ceiling, mid, scale-only,
// frequency-only, keyed high/low, single-module isolation) on 2026-07-11,
// captured the emailed reports, and least-squares fit our raw composite to
// their overall score:
//   siebold ~= 0.710 * ours + 243.5   (R^2 = 0.93, mean abs error ~25 / 800)
// The source scale is compressed (observed 355..764) relative to our raw
// composite; this transform matches it. Re-fit these two constants if you gather
// more data points. Module scores + the limiting factor stay on our own scale.
const SIEBOLD_CAL_SLOPE = 0.710
const SIEBOLD_CAL_INTERCEPT = 243.5

export function calibrateToSiebold(rawScore800: number): number {
  return clamp(Math.round(SIEBOLD_CAL_SLOPE * rawScore800 + SIEBOLD_CAL_INTERCEPT), 0, MAX_OVERALL)
}

// Overall (calibrated 0..800) -> class band. Thresholds set from the source
// tool's observed clusters: Entry <575, then Emerging, Developing (~"Middle"),
// Advanced, Elite (~"World Class", observed at 764).
export function overallClassForScore(score: number): DiagnosticClass {
  if (score >= 750) return 'ELITE'
  if (score >= 700) return 'ADVANCED'
  if (score >= 650) return 'DEVELOPING'
  if (score >= 575) return 'EMERGING'
  return 'ENTRY'
}

// Overall (calibrated 0..800) -> risk tier (the wash-out read; vault-only).
export function riskForScore(score: number): DiagnosticRisk {
  if (score >= 725) return 'STRONG'
  if (score >= 650) return 'ON_TRACK'
  if (score >= 575) return 'MODERATE'
  return 'NEEDS_IMPROVEMENT'
}

export interface ModuleScore { key: ModuleKey; name: string; pct: number; class: DiagnosticClass }
export interface Probabilities { licensing: number; retention: number; network: number; leadership: number }
export interface ConsistencyResult { index: number; penaltyPct: number; label: string }

export interface ScoredResult {
  overallScore: number          // 0..800, after the consistency penalty
  overallPct: number            // 0..100 (matches overallScore)
  overallClass: DiagnosticClass
  risk: DiagnosticRisk
  modules: ModuleScore[]
  limitingModule: ModuleKey
  recommendedFocus: string
  probabilities: Probabilities
  consistency: ConsistencyResult
  answeredCount: number
  totalCount: number
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const round1 = (n: number) => Math.round(n * 10) / 10

// Normalize a single answered item to 0..100, oriented so higher is stronger.
// Returns null when the item is unanswered or the value is out of range.
function itemScore(q: Question, raw: number | undefined): number | null {
  if (raw == null || Number.isNaN(raw)) return null
  if (q.type === 'scale') {
    if (raw < 1 || raw > 7) return null
    const norm = ((raw - 1) / 6) * 100
    return q.reverse ? 100 - norm : norm
  }
  if (q.type === 'frequency') {
    if (raw < 0 || raw > 4) return null
    return (raw / 4) * 100
  }
  // choice
  const opt = q.options[raw]
  return opt ? clamp(opt.weight * 100) : null
}

function moduleMean(module: ModuleKey, answers: Answers): { pct: number; answered: number; total: number } {
  const qs = QUESTIONS.filter(q => q.module === module)
  const scores: number[] = []
  for (const q of qs) {
    const s = itemScore(q, answers[q.key])
    if (s != null) scores.push(s)
  }
  const pct = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  return { pct, answered: scores.length, total: qs.length }
}

// Honesty / consistency check. Within each module we compare how the person
// scored positively-worded items vs reverse-worded items (both oriented so
// high = strong). An honest responder scores them similarly; someone who
// agrees with a statement AND its opposite pulls them apart. The mean gap is
// the inconsistency index (0..100). A gap only becomes a score penalty above a
// floor, and the penalty is capped so a genuinely mixed profile is not gutted.
function consistency(answers: Answers): ConsistencyResult {
  const gaps: number[] = []
  for (const m of MODULES) {
    const pos: number[] = []
    const rev: number[] = []
    for (const q of QUESTIONS) {
      if (q.module !== m.key || q.type !== 'scale') continue
      const s = itemScore(q, answers[q.key])
      if (s == null) continue
      ;(q.reverse ? rev : pos).push(s)
    }
    if (!pos.length || !rev.length) continue
    const pAvg = pos.reduce((a, b) => a + b, 0) / pos.length
    const rAvg = rev.reduce((a, b) => a + b, 0) / rev.length
    gaps.push(Math.abs(pAvg - rAvg))
  }
  const index = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0

  // Penalty: nothing under 20, ramping to a hard cap of 15% by index 60.
  const FLOOR = 20, CEIL = 60, MAX_PENALTY = 0.15
  let penaltyPct = 0
  if (index > FLOOR) penaltyPct = Math.min(MAX_PENALTY, ((index - FLOOR) / (CEIL - FLOOR)) * MAX_PENALTY)

  let label: string
  if (index < 20) label = 'Highly consistent'
  else if (index < 35) label = 'Consistent'
  else if (index < 50) label = 'Some inconsistency'
  else label = 'Low consistency'

  return { index, penaltyPct: Math.round(penaltyPct * 100), label }
}

// Weighted blends for the four forward-looking indicators. Weights sum to 1.
const PROB_WEIGHTS: Record<keyof Probabilities, Partial<Record<ModuleKey, number>>> = {
  licensing:  { discipline: 0.4, identity: 0.35, self_awareness: 0.25 },
  retention:  { resilience: 0.4, mission: 0.35, pressure: 0.25 },
  network:    { building: 0.4, network: 0.35, conversion: 0.25 },
  leadership: { leadership: 0.4, conversion: 0.35, self_awareness: 0.25 },
}

export function scoreDiagnostic(answers: Answers): ScoredResult {
  const modulePcts = new Map<ModuleKey, number>()
  let answeredCount = 0
  const modules: ModuleScore[] = MODULES.map(m => {
    const { pct, answered } = moduleMean(m.key, answers)
    answeredCount += answered
    modulePcts.set(m.key, pct)
    return { key: m.key, name: m.name, pct: round1(pct), class: classForPct(pct) }
  })

  const rawOverall = modules.reduce((a, m) => a + (modulePcts.get(m.key) ?? 0), 0) / modules.length
  const cons = consistency(answers)
  const adjustedPct = clamp(rawOverall * (1 - cons.penaltyPct / 100))
  // Our raw composite, then calibrated onto the source tool's 800-point scale.
  const rawScore = (adjustedPct / 100) * MAX_OVERALL
  const overallScore = calibrateToSiebold(rawScore)
  const overallPct = round1((overallScore / MAX_OVERALL) * 100)

  const probabilities = Object.fromEntries(
    (Object.keys(PROB_WEIGHTS) as (keyof Probabilities)[]).map(k => {
      const w = PROB_WEIGHTS[k]
      let v = 0
      for (const [mod, weight] of Object.entries(w)) v += (modulePcts.get(mod as ModuleKey) ?? 0) * (weight as number)
      return [k, round1(clamp(v))]
    }),
  ) as unknown as Probabilities

  // Limiting factor = lowest module (ties break by module order).
  const limiting = [...modules].sort((a, b) => a.pct - b.pct || a.key.localeCompare(b.key))[0]
  const limitingModule = limiting.key
  const recommendedFocus = MODULE_BY_KEY[limitingModule].coachingTip

  return {
    overallScore,
    overallPct,
    overallClass: overallClassForScore(overallScore),
    risk: riskForScore(overallScore),
    modules,
    limitingModule,
    recommendedFocus,
    probabilities,
    consistency: cons,
    answeredCount,
    totalCount: TOTAL_QUESTIONS,
  }
}

// Validate a submitted answers map: every question answered with an in-range
// value. Returns the list of missing/invalid question keys (empty = valid).
export function validateAnswers(answers: Answers): string[] {
  const bad: string[] = []
  for (const q of QUESTIONS) {
    if (itemScore(q, answers[q.key]) == null) bad.push(q.key)
  }
  // ignore unknown keys; only our questions matter
  void QUESTION_BY_KEY
  return bad
}
