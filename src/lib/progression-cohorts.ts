// Shared progression-cohort logic used by the /vault/progress/cohorts page and
// the AI analysis route. Turns the raw progress-matrix payload (agents x
// checklist items + completion timestamps) into per-agent progress, the exact
// item each agent is stuck on, and a single cohort assignment per agent.
//
// The at-risk math is the SAME getAtRiskStatus used everywhere else in the
// portal, so this view never disagrees with the matrix.
import { getAtRiskStatus, PHASE_LABELS } from '@/lib/agent-constants'

export interface MatrixAgent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  avatarUrl: string | null
  state: string | null
  phaseStartedAt: string | null
  examDate: string | null
  subscribedToTevahAt: string | null
  lastLoginAt: string | null
  email: string | null
  recruiterId: string | null   // recruiter's agentCode
  cft: string | null           // trainer name
}

export interface MatrixItem {
  phase: number
  itemKey: string
  label: string
  groupKey: string | null
  adminOnly: boolean
}

export interface MatrixPayload {
  agents: MatrixAgent[]
  items: MatrixItem[]
  completedAt: Record<string, string>
}

export type CohortKey = 'at-risk' | 'behind' | 'stalled' | 'ready' | 'new' | 'on-track'

export interface AgentProgress {
  agent: MatrixAgent
  phase: number
  phaseTitle: string
  phaseGoal: string
  daysInPhase: number | null
  done: number
  total: number
  ratio: number
  status: 'on-track' | 'behind' | 'at-risk'
  lastLoginDays: number | null
  daysSinceProgress: number | null
  nextItems: { itemKey: string; label: string }[]
  cohort: CohortKey
  milestones: Milestones
}

const DAY = 86_400_000

// Milestone key sets (mirror the item keys in src/lib/agent-constants.ts).
const LICENSE_STEP_KEYS = ['licensing_class', 'pass_license_test', 'fingerprints_apply', 'submit_to_aff', 'ce_courses', 'errors_and_omissions', 'fully_appointed', 'direct_deposit']
const LICENSE_PASS_KEY = 'pass_license_test'
export const FTA_KEYS = Array.from({ length: 10 }, (_, i) => `fta_${i + 1}`)
const ASSOCIATE_PATH_KEYS = [...FTA_KEYS, 'client_1', 'client_2', 'client_3', 'first_1000']
const CFT_KEYS = ['cft_classes', 'trainer_signoff', 'cft_coordinator_signoff', 'emd_signoff']

const KEY_LABELS: Record<string, string> = {
  licensing_class: 'Pre-licensing / schedule exam', pass_license_test: 'Pass life license exam',
  fingerprints_apply: 'Fingerprints + apply', submit_to_aff: 'Submit to GFI', ce_courses: 'CE courses',
  errors_and_omissions: 'E&O insurance', fully_appointed: 'Get appointed', direct_deposit: 'Direct deposit',
}

// A Phase-1 agent this many days in without a passed exam is a red flag.
export const LICENSE_RED_FLAG_DAYS = 21

export interface Milestones {
  inLicensing: boolean          // Phase 1 and hasn't passed the exam
  passedExam: boolean
  daysInLicensing: number | null
  licenseFlag: boolean          // in licensing 21+ days
  examScheduled: boolean
  licenseDone: number           // of LICENSE_STEP_KEYS.length
  nextLicenseStep: string | null
  ftaDone: number               // of 10
  associateDone: number
  associateTotal: number
  associateNeeds: string[]      // remaining items for Senior Associate
  cftDone: number               // Phase 3 sign-offs of 4
  cftTotal: number
}

export const LICENSE_STEP_TOTAL = LICENSE_STEP_KEYS.length

export const COHORT_META: Record<CohortKey, { title: string; color: string; order: number; blurb: string }> = {
  'at-risk':  { title: 'At risk',          color: '#c0392b', order: 0, blurb: 'Past 1.5× the expected time in phase and below the completion threshold. Needs a direct intervention now.' },
  'behind':   { title: 'Slipping behind',  color: '#b7791f', order: 1, blurb: 'Just over the expected pace. A quick check-in keeps them from sliding into "at risk."' },
  'stalled':  { title: 'Gone quiet',       color: '#5a6b7b', order: 2, blurb: "Haven't logged in for 14+ days. Re-engage personally, not with another automated email." },
  'ready':    { title: 'Ready to advance', color: '#a9812f', order: 3, blurb: "90%+ of the current phase is done. Process the promotion / sign-off so momentum isn't lost." },
  'new':      { title: 'Fresh onboards',   color: '#2b6cb0', order: 4, blurb: 'New in Phase 1. Make sure their trainer reached out and Fast Start is booked.' },
  'on-track': { title: 'On track',         color: '#2f855a', order: 5, blurb: 'Progressing at a healthy pace. No intervention required.' },
}

export function cohortOf(p: {
  status: 'on-track' | 'behind' | 'at-risk'
  lastLoginDays: number | null
  ratio: number
  phase: number
  daysInPhase: number | null
}): CohortKey {
  if (p.status === 'at-risk') return 'at-risk'
  if (p.status === 'behind') return 'behind'
  if (p.lastLoginDays != null && p.lastLoginDays >= 14) return 'stalled'
  if (p.ratio >= 0.9) return 'ready'
  if (p.phase === 1 && (p.daysInPhase == null || p.daysInPhase <= 7)) return 'new'
  return 'on-track'
}

export function computeProgress(payload: MatrixPayload, now = Date.now()): AgentProgress[] {
  const { agents, items, completedAt } = payload
  const labelByKey = new Map(items.map(it => [it.itemKey, it.label]))
  return agents.map(a => {
    const phaseItems = items.filter(it => it.phase === a.phase && !it.adminOnly)
    const total = phaseItems.length
    let done = 0
    let lastProgress = 0
    const nextItems: { itemKey: string; label: string }[] = []
    for (const it of phaseItems) {
      const ts = completedAt[`${a.id}:${it.itemKey}`]
      if (ts) {
        done++
        const t = Date.parse(ts)
        if (!Number.isNaN(t) && t > lastProgress) lastProgress = t
      } else {
        nextItems.push({ itemKey: it.itemKey, label: it.label })
      }
    }
    const ratio = total > 0 ? done / total : 1
    const startedAt = a.phaseStartedAt ? new Date(a.phaseStartedAt) : null
    const status = getAtRiskStatus(a.phase, startedAt, done, total)
    const daysInPhase = startedAt ? Math.floor((now - startedAt.getTime()) / DAY) : null
    const lastLoginDays = a.lastLoginAt ? Math.floor((now - Date.parse(a.lastLoginAt)) / DAY) : null
    const daysSinceProgress = lastProgress ? Math.floor((now - lastProgress) / DAY) : daysInPhase
    const label = PHASE_LABELS[a.phase]

    // Milestone tracks, computed straight off the completion map.
    const doneKey = (k: string) => !!completedAt[`${a.id}:${k}`]
    const passedExam = doneKey(LICENSE_PASS_KEY)
    const inLicensing = a.phase === 1 && !passedExam
    const nextLicenseKey = LICENSE_STEP_KEYS.find(k => !doneKey(k))
    const associateNeedKeys = ASSOCIATE_PATH_KEYS.filter(k => !doneKey(k))
    const milestones: Milestones = {
      inLicensing,
      passedExam,
      daysInLicensing: inLicensing ? daysInPhase : null,
      licenseFlag: inLicensing && daysInPhase != null && daysInPhase >= LICENSE_RED_FLAG_DAYS,
      examScheduled: !!a.examDate,
      licenseDone: LICENSE_STEP_KEYS.filter(doneKey).length,
      nextLicenseStep: nextLicenseKey ? (KEY_LABELS[nextLicenseKey] ?? labelByKey.get(nextLicenseKey) ?? nextLicenseKey) : null,
      ftaDone: FTA_KEYS.filter(doneKey).length,
      associateDone: ASSOCIATE_PATH_KEYS.length - associateNeedKeys.length,
      associateTotal: ASSOCIATE_PATH_KEYS.length,
      associateNeeds: associateNeedKeys.map(k => labelByKey.get(k) ?? KEY_LABELS[k] ?? k),
      cftDone: CFT_KEYS.filter(doneKey).length,
      cftTotal: CFT_KEYS.length,
    }

    return {
      agent: a, phase: a.phase,
      phaseTitle: label?.title ?? `Phase ${a.phase}`,
      phaseGoal: label?.goal ?? '',
      daysInPhase, done, total, ratio, status, lastLoginDays, daysSinceProgress, nextItems,
      cohort: cohortOf({ status, lastLoginDays, ratio, phase: a.phase, daysInPhase }),
      milestones,
    }
  })
}

// ── Team scoping (recruiter / trainer) ───────────────────────────────────────

export interface TeamOption { kind: 'recruiter' | 'trainer'; value: string; label: string; count: number }

// Build the recruiter + trainer filter options from the roster. Recruiters are
// keyed by agentCode; if that recruiter is also in the roster we resolve their
// name, otherwise we show the code.
export function teamOptions(rows: AgentProgress[]): TeamOption[] {
  const nameByCode = new Map(rows.map(r => [r.agent.agentCode, `${r.agent.firstName} ${r.agent.lastName}`]))
  const recruiters = new Map<string, number>()
  const trainers = new Map<string, number>()
  for (const r of rows) {
    const rec = r.agent.recruiterId?.trim()
    if (rec) recruiters.set(rec, (recruiters.get(rec) ?? 0) + 1)
    const cft = r.agent.cft?.trim()
    if (cft) trainers.set(cft, (trainers.get(cft) ?? 0) + 1)
  }
  const opts: TeamOption[] = []
  for (const [code, count] of recruiters) opts.push({ kind: 'recruiter', value: code, label: nameByCode.get(code) ?? code, count })
  for (const [name, count] of trainers) opts.push({ kind: 'trainer', value: name, label: name, count })
  return opts.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function filterByTeam(rows: AgentProgress[], team: { kind: 'recruiter' | 'trainer'; value: string } | null): AgentProgress[] {
  if (!team) return rows
  if (team.kind === 'recruiter') return rows.filter(r => r.agent.recruiterId === team.value)
  return rows.filter(r => r.agent.cft === team.value)
}

// Compact, PII-light roster summary for the AI analysis prompt. First names
// only, no email/phone; agent code is the stable handle.
export function summarizeForAI(rows: AgentProgress[]) {
  return rows.map(r => ({
    code: r.agent.agentCode,
    name: r.agent.firstName,
    state: r.agent.state,
    phase: r.phase,
    phaseTitle: r.phaseTitle,
    goal: r.phaseGoal,
    daysInPhase: r.daysInPhase,
    pct: Math.round(r.ratio * 100),
    status: r.status,
    cohort: r.cohort,
    lastLoginDays: r.lastLoginDays,
    daysSinceProgress: r.daysSinceProgress,
    stuckOn: r.nextItems.slice(0, 3).map(i => i.label),
    recruiter: r.agent.recruiterId,
    trainer: r.agent.cft,
    // milestone signals
    inLicensing: r.milestones.inLicensing,
    daysInLicensing: r.milestones.daysInLicensing,
    licenseRedFlag: r.milestones.licenseFlag,
    examScheduled: r.milestones.examScheduled,
    passedExam: r.milestones.passedExam,
    nextLicenseStep: r.milestones.nextLicenseStep,
    ftaDone: r.phase === 2 ? r.milestones.ftaDone : undefined,
    seniorAssociateNeeds: r.phase === 2 ? r.milestones.associateNeeds.slice(0, 4) : undefined,
    cftSignoffs: r.phase === 3 ? `${r.milestones.cftDone}/${r.milestones.cftTotal}` : undefined,
  }))
}

// Deterministic fallback "plays" so the feature always returns something useful
// even if the AI call fails or ANTHROPIC_API_KEY is unset. Groups the agents
// who need attention by their shared next blocking item and ranks by headcount.
export interface Play {
  title: string
  owner: string
  impact: string
  action: string
  agentCodes: string[]
}

export function fallbackPlays(rows: AgentProgress[]): Play[] {
  const needs = rows.filter(r => r.cohort === 'at-risk' || r.cohort === 'behind' || r.cohort === 'stalled')
  const byBlocker = new Map<string, AgentProgress[]>()
  for (const r of needs) {
    const key = `${r.phase}::${r.nextItems[0]?.label ?? 'Re-engage'}`
    ;(byBlocker.get(key) ?? byBlocker.set(key, []).get(key)!).push(r)
  }
  const plays: Play[] = [...byBlocker.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([key, group]) => {
      const [phase, blocker] = key.split('::')
      const owner = Number(phase) === 1 ? 'Licensing Coordinator' : Number(phase) === 2 ? 'CFT / Trainer' : 'EMD / Upline'
      return {
        title: `Unblock "${blocker}" (Phase ${phase})`,
        owner,
        impact: `${group.length} agent${group.length > 1 ? 's' : ''} stuck on the same step. Clearing it moves ${group.length > 1 ? 'all of them' : 'them'} forward at once.`,
        action: `Reach out to each agent, confirm the specific obstacle on "${blocker}", and remove it (schedule, resource, or a live walkthrough). Batch them into one session if possible.`,
        agentCodes: group.map(g => g.agent.agentCode),
      }
    })
  const ready = rows.filter(r => r.cohort === 'ready')
  if (ready.length) {
    plays.push({
      title: `Advance ${ready.length} agent${ready.length > 1 ? 's' : ''} who ${ready.length > 1 ? 'are' : 'is'} basically done`,
      owner: 'Admin / EMD',
      impact: `These agents have cleared 90%+ of their phase. Advancing them protects momentum and frees the pipeline.`,
      action: `Review each for their promotion / sign-off requirement and process it this week.`,
      agentCodes: ready.map(r => r.agent.agentCode),
    })
  }
  return plays
}
