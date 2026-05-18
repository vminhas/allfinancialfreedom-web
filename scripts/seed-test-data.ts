/**
 * Idempotent demo / test-data seeder.
 *
 *   Run with: npx tsx scripts/seed-test-data.ts
 *
 * WHAT THIS IS
 * ------------
 * The CEO wants the demo account loaded with realistic content on every
 * screen. This script attaches a "ton of test data" to ONE designated
 * account: the agent with email `test@allfinancialfreedom.com`, plus a
 * synthetic downline it builds underneath that test agent.
 *
 * SAFETY GUARANTEE
 * ----------------
 * This script is scoped to the test account and is SAFE TO RUN against
 * ANY database, including production:
 *
 *   - It ONLY adds rows that belong to the test agent or to synthetic
 *     downline agents it creates (deterministic agentCodes `TEST-Dnn`,
 *     emails `test+dnn@allfinancialfreedom.com`).
 *   - It NEVER mutates or deletes unrelated / global rows. It never
 *     touches real agents, Settings, EmailTemplate/EmailSender rows,
 *     PhaseItemDefinition / PhaseGroupDefinition / ProgressionDefinition,
 *     Announcements (global), Contests/ClimbMilestones (global config),
 *     ImportJobs, Contacts, etc.
 *   - Every synthetic AgentProfile gets `isTest: true` so it is hidden
 *     from every roster-facing view, leaderboard, and aggregate.
 *   - It is fully idempotent: running it 2x creates no duplicates.
 *     Every create is guarded by a deterministic-key existence check or
 *     uses a unique-constraint upsert / findFirst-then-create.
 *
 * It does NOT seed a model called `AgentNote` (intentionally omitted,
 * that model is being added separately).
 */

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = new PrismaClient({ adapter } as any)

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL = 'test@allfinancialfreedom.com'
const TEST_PASSWORD = 'testtest123'
const TEST_CODE = 'TEST001'

// Phase 1 checklist keys (mirrors reset-test-agent.ts).
const PHASE_1_KEYS = [
  'week1_onboarding', 'licensing_class', 'pfr', 'fast_start_school',
  'week2_onboarding', 'business_marketing_plan', 'pass_license_test',
  'fingerprints_apply', 'submit_to_aff', 'ce_courses', 'errors_and_omissions',
  'direct_deposit', 'week3_onboarding', 'master_scripts', 'schedule_10_trainings',
]

// Phase item keys per phase (mirrors src/lib/agent-constants.ts shape used
// in seed-agents.ts). Only used to mark previous phases complete.
const PHASE_ITEMS: Record<number, string[]> = {
  1: PHASE_1_KEYS,
  2: [
    'fta_1', 'fta_2', 'fta_3', 'fta_4', 'fta_5', 'fta_6', 'fta_7', 'fta_8',
    'fta_9', 'fta_10', 'associate_promotion', 'direct_1', 'direct_2',
    'direct_3', 'client_1', 'client_2', 'client_3', 'net_license', 'first_1000',
  ],
  3: [
    'cft_classes', 'trainer_signoff', 'cft_coordinator_signoff', 'emd_signoff',
    'client_1st_apt', 'client_2nd_apt', 'phone_call_scripts',
    'recruiting_interview', 'top_5_products',
  ],
  4: [
    '45k_points', 'month1_premium', 'month2_premium', 'month3_premium',
    'license_1', 'license_2', 'license_3', 'license_4', 'license_5',
  ],
  5: [
    '150k_net_6mo', '1_marketing_director', 'license_1', 'license_2',
    'license_3', 'license_4', 'license_5',
  ],
}

const CARRIERS = [
  'ANICO Life', 'ANICO Annuity', 'Augustar', 'Corebridge Life',
  'Corebridge Annuity', 'Lincoln', 'Foresters', 'Mutual of Omaha', 'SILAC',
  'American Equity', 'North American Life', 'North American Annuity',
  'F&G Life', 'F&G Annuity', 'Equitrust', 'Prudential',
]

// ─── Deterministic synthetic downline definition ─────────────────────────────
//
// agentCode scheme:  TEST-D01 .. TEST-D16
// email scheme:      test+d01@allfinancialfreedom.com .. test+d16@...
// recruiterId chains the agentCode of the recruiter to build the tree:
//
//   TEST001 (the test agent)
//     ├─ D01 ─ D05 ─ D11
//     │       └ D06 ─ D12
//     ├─ D02 ─ D07 ─ D13
//     │       └ D08
//     ├─ D03 ─ D09 ─ D14
//     │       └ D15
//     └─ D04 ─ D10 ─ D16

interface DownlineSeed {
  n: number
  firstName: string
  lastName: string
  state: string
  /** agentCode of recruiter, or TEST_CODE for direct recruits of test agent. */
  recruiterCode: string
  phase: number
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED'
  goal: string | null
  /** true => give this agent a PersonalFinancialReview (deliberately partial). */
  pfr: boolean
}

const DOWNLINE: DownlineSeed[] = [
  { n: 1,  firstName: 'Marcus',   lastName: 'Holloway',  state: 'TX', recruiterCode: TEST_CODE, phase: 3, status: 'ACTIVE',   goal: 'EMD', pfr: true },
  { n: 2,  firstName: 'Priya',    lastName: 'Raman',     state: 'CA', recruiterCode: TEST_CODE, phase: 4, status: 'ACTIVE',   goal: 'MD',  pfr: true },
  { n: 3,  firstName: 'DeShawn',  lastName: 'Carter',    state: 'GA', recruiterCode: TEST_CODE, phase: 2, status: 'ACTIVE',   goal: 'SMD', pfr: false },
  { n: 4,  firstName: 'Hannah',   lastName: 'Whitfield', state: 'OH', recruiterCode: TEST_CODE, phase: 5, status: 'ACTIVE',   goal: 'NSD', pfr: true },
  { n: 5,  firstName: 'Tyler',    lastName: 'Brennan',   state: 'NC', recruiterCode: 'TEST-D01', phase: 2, status: 'ACTIVE',   goal: 'MD',  pfr: true },
  { n: 6,  firstName: 'Sofia',    lastName: 'Delgado',   state: 'FL', recruiterCode: 'TEST-D01', phase: 1, status: 'ACTIVE',   goal: 'MD',  pfr: false },
  { n: 7,  firstName: 'Jamal',    lastName: 'Okafor',    state: 'NY', recruiterCode: 'TEST-D02', phase: 3, status: 'ACTIVE',   goal: 'EMD', pfr: true },
  { n: 8,  firstName: 'Brittany', lastName: 'Nguyen',    state: 'WA', recruiterCode: 'TEST-D02', phase: 1, status: 'INVITED',  goal: null,  pfr: false },
  { n: 9,  firstName: 'Caleb',    lastName: 'Foster',    state: 'AZ', recruiterCode: 'TEST-D03', phase: 2, status: 'ACTIVE',   goal: 'MD',  pfr: false },
  { n: 10, firstName: 'Maya',     lastName: 'Thompson',  state: 'CO', recruiterCode: 'TEST-D04', phase: 4, status: 'ACTIVE',   goal: 'SMD', pfr: true },
  { n: 11, firstName: 'Andre',    lastName: 'Bautista',  state: 'NJ', recruiterCode: 'TEST-D05', phase: 1, status: 'ACTIVE',   goal: 'MD',  pfr: false },
  { n: 12, firstName: 'Olivia',   lastName: 'Sanderson', state: 'VA', recruiterCode: 'TEST-D06', phase: 2, status: 'ACTIVE',   goal: 'MD',  pfr: true },
  { n: 13, firstName: 'Reuben',   lastName: 'Castillo',  state: 'TN', recruiterCode: 'TEST-D07', phase: 1, status: 'INACTIVE', goal: null,  pfr: false },
  { n: 14, firstName: 'Naomi',    lastName: 'Park',      state: 'IL', recruiterCode: 'TEST-D09', phase: 1, status: 'ACTIVE',   goal: 'MD',  pfr: false },
  { n: 15, firstName: 'Garrett',  lastName: 'Mills',     state: 'MD', recruiterCode: 'TEST-D03', phase: 3, status: 'ACTIVE',   goal: 'EMD', pfr: true },
  { n: 16, firstName: 'Lena',     lastName: 'Abara',     state: 'PA', recruiterCode: 'TEST-D04', phase: 2, status: 'ACTIVE',   goal: 'MD',  pfr: false },
]

const STATUS_FALLBACK = 'INACTIVE' as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function code(n: number): string {
  return `TEST-D${String(n).padStart(2, '0')}`
}
function email(n: number): string {
  return `test+d${String(n).padStart(2, '0')}@allfinancialfreedom.com`
}
function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000)
}
/** AgentProfile.status only allows ACTIVE | INACTIVE; INVITED is a UI state
 *  (no password). Map INVITED -> INACTIVE for the column. */
function profileStatus(s: DownlineSeed['status']): 'ACTIVE' | 'INACTIVE' {
  return s === 'ACTIVE' ? 'ACTIVE' : STATUS_FALLBACK
}

const summary: Record<string, { created: number; skipped: number }> = {}
function tally(model: string, created: boolean) {
  summary[model] ??= { created: 0, skipped: 0 }
  if (created) summary[model].created++
  else summary[model].skipped++
}

// ─── 1. Test agent (upsert by email) ─────────────────────────────────────────

async function ensureTestAgent(): Promise<string> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12)

  const existing = await db.agentUser.findUnique({
    where: { email: TEST_EMAIL },
    include: { profile: true },
  })

  if (existing) {
    if (existing.profile) {
      await db.agentProfile.update({
        where: { id: existing.profile.id },
        data: { status: 'ACTIVE', isTest: true },
      })
      tally('AgentProfile (test agent)', false)
      return existing.profile.id
    }
    const profile = await db.agentProfile.create({
      data: {
        agentUserId: existing.id,
        agentCode: TEST_CODE,
        firstName: 'Test',
        lastName: 'Agent',
        state: 'CA',
        phase: 2,
        phaseStartedAt: daysAgo(30),
        status: 'ACTIVE',
        isTest: true,
        goal: 'EMD',
      },
    })
    tally('AgentProfile (test agent)', true)
    return profile.id
  }

  const created = await db.agentUser.create({
    data: {
      email: TEST_EMAIL,
      passwordHash,
      profile: {
        create: {
          agentCode: TEST_CODE,
          firstName: 'Test',
          lastName: 'Agent',
          state: 'CA',
          phase: 2,
          phaseStartedAt: daysAgo(30),
          status: 'ACTIVE',
          isTest: true,
          goal: 'EMD',
          phaseItems: {
            create: PHASE_1_KEYS.map((key) => ({
              phase: 1,
              itemKey: key,
              completed: true,
              completedAt: daysAgo(35),
            })),
          },
          carrierAppointments: {
            create: CARRIERS.map((carrier, i) => ({
              carrier,
              status: i < 6 ? 'APPOINTED' : i < 10 ? 'PENDING' : 'NOT_STARTED',
              appointedDate: i < 6 ? daysAgo(40) : null,
            })),
          },
        },
      },
    },
    include: { profile: true },
  })
  tally('AgentProfile (test agent)', true)
  return created.profile!.id
}

// ─── 2. Synthetic downline ───────────────────────────────────────────────────

interface ProfileRef {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  status: DownlineSeed['status']
}

async function ensureDownline(): Promise<ProfileRef[]> {
  const refs: ProfileRef[] = []

  for (const d of DOWNLINE) {
    const agentCode = code(d.n)
    const addr = email(d.n)

    const existing = await db.agentProfile.findUnique({
      where: { agentCode },
      select: { id: true },
    })
    if (existing) {
      tally('AgentProfile (downline)', false)
      refs.push({
        id: existing.id,
        agentCode,
        firstName: d.firstName,
        lastName: d.lastName,
        phase: d.phase,
        status: d.status,
      })
      continue
    }

    // Build phase items: every prior phase fully complete, current phase
    // partially complete (first ~half done) so the team view shows
    // realistic in-progress checklists + last-activity timestamps.
    const phaseItemRows: {
      phase: number
      itemKey: string
      completed: boolean
      completedAt: Date | null
    }[] = []
    for (let p = 1; p <= 5; p++) {
      const keys = PHASE_ITEMS[p] ?? []
      keys.forEach((key, idx) => {
        let completed = false
        let completedAt: Date | null = null
        if (p < d.phase) {
          completed = true
          completedAt = daysAgo(20 + (d.phase - p) * 7 + idx)
        } else if (p === d.phase && d.status === 'ACTIVE') {
          // Roughly first half of the current phase done.
          completed = idx < Math.ceil(keys.length / 2)
          completedAt = completed ? daysAgo(2 + idx + d.n) : null
        }
        phaseItemRows.push({ phase: p, itemKey: key, completed, completedAt })
      })
    }

    const user = await db.agentUser.create({
      data: {
        email: addr,
        passwordHash: d.status === 'INVITED' ? null : await bcrypt.hash(TEST_PASSWORD, 12),
        inviteToken: d.status === 'INVITED' ? `test-invite-${agentCode}` : null,
        inviteExpires: d.status === 'INVITED' ? daysAgo(-7) : null,
      },
    })

    const profile = await db.agentProfile.create({
      data: {
        agentUserId: user.id,
        agentCode,
        firstName: d.firstName,
        lastName: d.lastName,
        state: d.state,
        phone: `(555) 0${String(d.n).padStart(2, '0')}-${1000 + d.n}`,
        recruiterId: d.recruiterCode,
        status: profileStatus(d.status),
        isTest: true,
        phase: d.phase,
        phaseStartedAt: daysAgo(14 + d.n),
        goal: d.goal,
        icaDate: daysAgo(60 + d.n * 3),
        badges: d.phase >= 3 ? ['fast_start', 'first_client'] : [],
        phaseItems: { create: phaseItemRows },
        carrierAppointments: {
          create: CARRIERS.map((carrier, i) => ({
            carrier,
            status:
              d.phase >= 3 && i < 5
                ? 'APPOINTED'
                : d.phase >= 2 && i < 3
                  ? 'PENDING'
                  : 'NOT_STARTED',
            appointedDate: d.phase >= 3 && i < 5 ? daysAgo(30) : null,
          })),
        },
      },
    })
    tally('AgentProfile (downline)', true)
    tally('AgentUser (downline)', true)
    refs.push({
      id: profile.id,
      agentCode,
      firstName: d.firstName,
      lastName: d.lastName,
      phase: d.phase,
      status: d.status,
    })
  }

  return refs
}

// ─── 3. PersonalFinancialReview (partial coverage) ───────────────────────────

async function ensurePFRs(testProfileId: string, downline: ProfileRef[]) {
  const targets: { id: string; seed: number }[] = [
    { id: testProfileId, seed: 0 },
    ...DOWNLINE.filter((d) => d.pfr).map((d) => ({
      id: downline.find((r) => r.agentCode === code(d.n))!.id,
      seed: d.n,
    })),
  ]

  for (const t of targets) {
    const existing = await db.personalFinancialReview.findUnique({
      where: { agentProfileId: t.id },
      select: { id: true },
    })
    if (existing) {
      tally('PersonalFinancialReview', false)
      continue
    }
    const base = 4000 + t.seed * 350
    await db.personalFinancialReview.create({
      data: {
        agentProfileId: t.id,
        monthlyIncome: base + 2500,
        expenses: {
          housing: 1800 + t.seed * 25,
          transportation: 450,
          food: 700,
          insurance: 320,
          utilities: 280,
          other: 500,
        },
        assets: {
          checking: 3200 + t.seed * 100,
          savings: 12000 + t.seed * 800,
          retirement_401k: 45000 + t.seed * 2500,
          home_equity: 80000,
        },
        debts: {
          credit_cards: 6500 - t.seed * 200,
          auto_loan: 14000,
          student_loans: 22000,
          mortgage: 210000,
        },
        buckets: {
          green: 12000 + t.seed * 800,
          yellow: 45000 + t.seed * 2500,
          red: 80000,
        },
        retirementAge: 65,
        spouseRetAge: 63,
        desiredMonthlyRetirement: 7500,
        monthlySavingsCommitment: 600 + t.seed * 25,
        whatWouldThisDo:
          'Retire on my terms and take care of my parents without stress.',
        whatIsStopping: 'Not enough margin each month and no clear plan.',
        dreamsAndGoals: [
          { title: 'Pay off all consumer debt', timeframe: '24 months' },
          { title: 'Build a 6-month emergency fund', timeframe: '12 months' },
          { title: 'Family trip to Portugal', timeframe: '18 months' },
        ],
        notes: 'Reviewed during onboarding. Motivated, needs a savings system.',
      },
    })
    tally('PersonalFinancialReview', true)
  }
}

// ─── 4. BusinessPartner contacts ─────────────────────────────────────────────

const BP_FIRST = ['James', 'Maria', 'Robert', 'Linda', 'David', 'Patricia', 'John', 'Jennifer', 'Michael', 'Susan', 'William', 'Karen', 'Richard', 'Nancy', 'Joseph', 'Lisa']
const BP_LAST = ['Anderson', 'Mitchell', 'Coleman', 'Reyes', 'Brooks', 'Sullivan', 'Patel', 'Nguyen', 'Russo', 'Hayes', 'Bennett', 'Ford', 'Greer', 'Walsh', 'Diaz', 'Munoz']
const OCCUPATIONS = ['Teacher', 'Nurse', 'Truck Driver', 'Small Business Owner', 'Engineer', 'Realtor', 'Electrician', 'Retired Military', 'Accountant', 'Stay-at-home Parent']
const TRAITS = ['Driven, family-first', 'Analytical, cautious', 'Outgoing, well-connected', 'Skeptical but fair', 'Coachable, eager', 'Busy, hard to reach']
const TZS = ['ET', 'CT', 'MT', 'PT']
const AGES = ['28', '34', '41', '47', '52', '58', '63']
// category null = "in queue, not yet classified"
const CATEGORIES: (string | null)[] = ['business_partner', 'fta_contact', null, 'business_partner', null, 'fta_contact']
const BP_STATUSES = ['NEW', 'CONTACTED', 'INTRO_SENT', 'BOOKED', 'PENDING', 'SKIPPED']

async function ensureBusinessPartners(
  testProfileId: string,
  downline: ProfileRef[],
) {
  // Owners that get BP rows: the test agent + ~half the active downline.
  const owners: { id: string; tag: string }[] = [
    { id: testProfileId, tag: 'TEST001' },
    ...downline
      .filter((r) => r.status === 'ACTIVE')
      .filter((_, i) => i % 2 === 0)
      .map((r) => ({ id: r.id, tag: r.agentCode })),
  ]

  for (const owner of owners) {
    const perOwner = owner.tag === 'TEST001' ? 14 : 6
    for (let i = 0; i < perOwner; i++) {
      const name = `${BP_FIRST[i % BP_FIRST.length]} ${BP_LAST[(i + 3) % BP_LAST.length]}`
      const category = CATEGORIES[i % CATEGORIES.length]
      const status =
        category === null
          ? i % 3 === 0
            ? 'SKIPPED'
            : 'PENDING'
          : BP_STATUSES[i % BP_STATUSES.length]
      // Deterministic existence key: (owner, name, phaseItemKey-tag).
      const tagKey = `seed:${owner.tag}:${i}`
      const existing = await db.businessPartner.findFirst({
        where: { agentProfileId: owner.id, name, notes: { contains: tagKey } },
        select: { id: true },
      })
      if (existing) {
        tally('BusinessPartner', false)
        continue
      }
      await db.businessPartner.create({
        data: {
          agentProfileId: owner.id,
          name,
          email: `${name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`,
          phone: `(555) 7${String(i).padStart(2, '0')}-${2000 + i}`,
          timeZone: TZS[i % TZS.length],
          age: AGES[i % AGES.length],
          married: i % 2 === 0,
          children: i % 3 !== 0,
          homeowner: i % 2 === 1,
          occupation: OCCUPATIONS[i % OCCUPATIONS.length],
          characterTraits: TRAITS[i % TRAITS.length],
          category,
          status,
          source: i % 4 === 0 ? 'csv_import' : 'manual',
          bookedAppt: status === 'BOOKED',
          appointmentDate: status === 'BOOKED' ? daysAgo(-3 - i) : null,
          firstCallDate: ['CONTACTED', 'INTRO_SENT', 'BOOKED'].includes(status)
            ? daysAgo(10 + i)
            : null,
          lastContactAt: status !== 'PENDING' ? daysAgo(5 + i) : null,
          notes: `Met at community event. Strong network. [${tagKey}]`,
          createdAt: daysAgo(45 - i),
        },
      })
      tally('BusinessPartner', true)
    }
  }
}

// ─── 5. FieldTrainingAppointment ─────────────────────────────────────────────

async function ensureFTAs(testProfileId: string, downline: ProfileRef[]) {
  const owners = [
    { id: testProfileId, tag: 'TEST001' },
    ...downline.filter((r) => r.phase >= 2 && r.status === 'ACTIVE').slice(0, 5).map((r) => ({ id: r.id, tag: r.agentCode })),
  ]
  const statuses = ['COMPLETED', 'COMPLETED', 'SCHEDULED', 'RESCHEDULED', 'NO_SHOW', 'CANCELLED'] as const
  const cats = ['UNDER_50', 'FIFTY_PLUS', 'FIFTY_NINE_HALF_PLUS', 'JUST_RETIRED', 'TRANSITIONING_JOBS', 'RECEIVED_INHERITANCE'] as const

  for (const owner of owners) {
    for (let i = 0; i < 6; i++) {
      const status = statuses[i % statuses.length]
      const name = `${BP_FIRST[(i + 2) % BP_FIRST.length]} ${BP_LAST[i % BP_LAST.length]}`
      const tagKey = `seedfta:${owner.tag}:${i}`
      const existing = await db.fieldTrainingAppointment.findFirst({
        where: { agentProfileId: owner.id, name, notes: { contains: tagKey } },
        select: { id: true },
      })
      if (existing) {
        tally('FieldTrainingAppointment', false)
        continue
      }
      const apptDate = status === 'SCHEDULED' ? daysAgo(-2 - i) : daysAgo(7 + i * 3)
      await db.fieldTrainingAppointment.create({
        data: {
          agentProfileId: owner.id,
          name,
          phone: `(555) 8${String(i).padStart(2, '0')}-${3000 + i}`,
          timeZone: TZS[i % TZS.length],
          age: 30 + i * 4,
          married: i % 2 === 0,
          children: i % 2,
          homeowner: i % 2 === 1,
          occupation60kPlus: i % 2 === 0,
          appointmentDate: apptDate,
          originalDate: status === 'RESCHEDULED' ? daysAgo(14 + i) : apptDate,
          category: cats[i % cats.length],
          status,
          notes: `FTA notes. [${tagKey}]`,
          outcomeNotes: status === 'COMPLETED' ? 'Client engaged, follow-up scheduled.' : null,
          completedAt: status === 'COMPLETED' ? apptDate : null,
          cancelledAt: status === 'CANCELLED' ? apptDate : null,
        },
      })
      tally('FieldTrainingAppointment', true)
    }
  }
}

// ─── 6. NewBusinessSubmission + notes + activity ─────────────────────────────

async function ensureSubmissions(
  testProfileId: string,
  downline: ProfileRef[],
  adminId: string | null,
) {
  const owners = [
    { id: testProfileId, tag: 'TEST001' },
    ...downline.filter((r) => r.phase >= 3).slice(0, 4).map((r) => ({ id: r.id, tag: r.agentCode })),
  ]
  const subStatuses = ['PENDING', 'ISSUED', 'DECLINED', 'LAPSED', 'NOT_TAKEN'] as const
  const policyTypes = ['TERM', 'WHOLE_LIFE', 'IUL', 'ANNUITY', 'DISABILITY'] as const

  for (const owner of owners) {
    for (let i = 0; i < 5; i++) {
      const status = subStatuses[i % subStatuses.length]
      const clientFirst = BP_FIRST[(i + 5) % BP_FIRST.length]
      const clientLast = BP_LAST[(i + 7) % BP_LAST.length]
      const policyNumber = `SEED-${owner.tag}-${i}`
      const existing = await db.newBusinessSubmission.findFirst({
        where: { agentProfileId: owner.id, policyNumber },
        select: { id: true },
      })
      if (existing) {
        tally('NewBusinessSubmission', false)
        continue
      }
      const sub = await db.newBusinessSubmission.create({
        data: {
          agentProfileId: owner.id,
          applicationDate: daysAgo(20 + i * 4),
          carrier: CARRIERS[i % CARRIERS.length],
          policyType: policyTypes[i % policyTypes.length],
          points: 1200 + i * 350,
          clientFirstName: clientFirst,
          clientLastName: clientLast,
          clientPhone: `(555) 9${String(i).padStart(2, '0')}-${4000 + i}`,
          clientEmail: `${clientFirst}.${clientLast}@example.com`.toLowerCase(),
          clientBirthday: daysAgo(365 * (35 + i)),
          clientState: DOWNLINE[i % DOWNLINE.length].state,
          status,
          policyNumber,
          issuedDate: status === 'ISSUED' ? daysAgo(8 + i) : null,
          declinedReason: status === 'DECLINED' ? 'Failed underwriting (health).' : null,
          createdAt: daysAgo(22 + i * 4),
        },
      })
      tally('NewBusinessSubmission', true)

      // Activity row
      await db.newBusinessSubmissionActivity.create({
        data: {
          submissionId: sub.id,
          actorAgentProfileId: owner.id,
          kind: 'CREATED',
          metaJson: { seeded: true },
          createdAt: daysAgo(22 + i * 4),
        },
      })
      tally('NewBusinessSubmissionActivity', true)

      // Agent-authored note
      await db.newBusinessNote.create({
        data: {
          submissionId: sub.id,
          body: 'Submitted application, waiting on carrier confirmation.',
          authorType: 'AGENT',
          authorAgentId: owner.id,
          createdAt: daysAgo(21 + i * 4),
        },
      })
      tally('NewBusinessNote (agent)', true)

      // Admin-authored note only if an AdminUser exists.
      if (adminId) {
        await db.newBusinessNote.create({
          data: {
            submissionId: sub.id,
            body: 'Reviewed. Please upload the signed illustration when available.',
            authorType: 'ADMIN',
            authorAdminId: adminId,
            createdAt: daysAgo(20 + i * 4),
          },
        })
        tally('NewBusinessNote (admin)', true)
      }
    }
  }
}

// ─── 7. AgentFeedback + AgentFeedbackNote thread ─────────────────────────────

async function ensureFeedback(
  testProfileId: string,
  downline: ProfileRef[],
  adminId: string | null,
) {
  const owners = [
    { id: testProfileId, tag: 'TEST001' },
    ...downline.slice(0, 4).map((r) => ({ id: r.id, tag: r.agentCode })),
  ]
  const categories = ['bug', 'feature', 'general', 'praise']
  const fbStatuses = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CLOSED']

  for (const owner of owners) {
    for (let i = 0; i < 2; i++) {
      const message = `[seedfb:${owner.tag}:${i}] ${
        i === 0
          ? 'The phase checklist sometimes does not save on mobile.'
          : 'Love the new team view, can we sort by last activity?'
      }`
      const existing = await db.agentFeedback.findFirst({
        where: { agentProfileId: owner.id, message },
        select: { id: true },
      })
      if (existing) {
        tally('AgentFeedback', false)
        continue
      }
      const status = fbStatuses[(owner.tag.length + i) % fbStatuses.length]
      const fb = await db.agentFeedback.create({
        data: {
          agentProfileId: owner.id,
          category: categories[i % categories.length],
          message,
          status,
          read: status !== 'OPEN',
          reviewedAt: status !== 'OPEN' ? daysAgo(4) : null,
          closedAt: status === 'CLOSED' ? daysAgo(1) : null,
          createdAt: daysAgo(9 + i),
        },
      })
      tally('AgentFeedback', true)

      // Agent clarification note
      await db.agentFeedbackNote.create({
        data: {
          feedbackId: fb.id,
          body: 'Happens on iPhone Safari specifically, Chrome is fine.',
          isInternal: false,
          authorAgentProfileId: owner.id,
          createdAt: daysAgo(8 + i),
        },
      })
      tally('AgentFeedbackNote (agent)', true)

      if (adminId && status !== 'OPEN') {
        await db.agentFeedbackNote.create({
          data: {
            feedbackId: fb.id,
            body: 'Thanks, reproduced it. Fix is in progress.',
            isInternal: false,
            authorAdminId: adminId,
            createdAt: daysAgo(7 + i),
          },
        })
        tally('AgentFeedbackNote (admin)', true)
        await db.agentFeedbackNote.create({
          data: {
            feedbackId: fb.id,
            body: 'Internal: tracked under JIRA-1234.',
            isInternal: true,
            authorAdminId: adminId,
            createdAt: daysAgo(7 + i),
          },
        })
        tally('AgentFeedbackNote (internal)', true)
      }
    }
  }
}

// ─── 8. Notifications (in-app) ───────────────────────────────────────────────

async function ensureNotifications(testProfileId: string, downline: ProfileRef[]) {
  const recips = [testProfileId, ...downline.slice(0, 5).map((r) => r.id)]
  const kinds: { kind: string; subjectType: string; title: string; body: string; linkUrl: string }[] = [
    { kind: 'feedback.response', subjectType: 'feedback', title: 'Your feedback got a reply', body: 'An admin responded to your ticket.', linkUrl: '/agents/feedback' },
    { kind: 'policy.comment', subjectType: 'policy', title: 'New comment on your policy', body: 'VM: Got the underwriting back, looking good.', linkUrl: '/agents/policies' },
    { kind: 'training.reminder', subjectType: 'training', title: 'Training starts in 15 minutes', body: 'Fast Start School begins soon.', linkUrl: '/agents/trainings' },
    { kind: 'announcement.new', subjectType: 'announcement', title: 'New announcement', body: 'Team contest kicks off Monday.', linkUrl: '/agents' },
    { kind: 'phase.promotion', subjectType: 'phase', title: 'You advanced a phase!', body: 'Congratulations on reaching Phase 3.', linkUrl: '/agents' },
    { kind: 'submission.status', subjectType: 'submission', title: 'Policy issued', body: 'Your submission was marked ISSUED.', linkUrl: '/agents/new-business' },
  ]

  for (const recipientId of recips) {
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i]
      const subjectId = `seed:${recipientId}:${k.kind}`
      const existing = await db.notification.findFirst({
        where: { recipientAgentProfileId: recipientId, kind: k.kind, subjectId },
        select: { id: true },
      })
      if (existing) {
        tally('Notification', false)
        continue
      }
      await db.notification.create({
        data: {
          recipientAgentProfileId: recipientId,
          kind: k.kind,
          subjectType: k.subjectType,
          subjectId,
          title: k.title,
          body: k.body,
          linkUrl: k.linkUrl,
          color: 0x4f46e5,
          readAt: i % 3 === 0 ? daysAgo(1) : null,
          createdAt: daysAgo(i),
        },
      })
      tally('Notification', true)
    }
  }
}

// ─── 9. RecognitionMilestone + ClimbAchievement ──────────────────────────────

async function ensureRecognition(testProfileId: string, downline: ProfileRef[]) {
  const owners = [
    { id: testProfileId, phase: 2 },
    ...downline.map((r) => ({ id: r.id, phase: r.phase })),
  ]
  const MILESTONES = ['fast_start', 'first_client', 'net_license', 'first_1000', 'associate', 'marketing_director']

  for (const owner of owners) {
    const count = Math.min(owner.phase + 1, MILESTONES.length)
    for (let i = 0; i < count; i++) {
      const milestone = MILESTONES[i]
      // unique([agentProfileId, milestone]) -> safe upsert.
      const existing = await db.recognitionMilestone.findFirst({
        where: { agentProfileId: owner.id, milestone },
        select: { id: true },
      })
      if (existing) {
        tally('RecognitionMilestone', false)
        continue
      }
      await db.recognitionMilestone.create({
        data: {
          agentProfileId: owner.id,
          milestone,
          status: i === count - 1 ? 'PENDING_REVIEW' : 'AWARDED',
          requestedAt: i === count - 1 ? daysAgo(2) : null,
          completedAt: daysAgo(10 + i * 5),
          notes: 'Seeded recognition milestone.',
        },
      })
      tally('RecognitionMilestone', true)
    }
  }

  // ClimbAchievement requires a ClimbMilestone (global config). Only link
  // to milestones that ALREADY exist; never create global ClimbMilestone
  // rows from this script.
  const climbMilestones = await db.climbMilestone.findMany({
    orderBy: { pointThreshold: 'asc' },
    take: 4,
    select: { id: true, pointThreshold: true },
  })
  if (climbMilestones.length > 0) {
    for (const owner of owners.slice(0, 6)) {
      const m = climbMilestones[0]
      const existing = await db.climbAchievement.findFirst({
        where: { agentProfileId: owner.id, milestoneId: m.id },
        select: { id: true },
      })
      if (existing) {
        tally('ClimbAchievement', false)
        continue
      }
      await db.climbAchievement.create({
        data: {
          agentProfileId: owner.id,
          milestoneId: m.id,
          pointsAtAchievement: m.pointThreshold + 500,
          achievedAt: daysAgo(12),
        },
      })
      tally('ClimbAchievement', true)
    }
  }
}

// ─── 10. CallLog + CallReview ────────────────────────────────────────────────

async function ensureCallLogs(testProfileId: string, downline: ProfileRef[]) {
  const owners = [testProfileId, ...downline.filter((r) => r.status === 'ACTIVE').slice(0, 4).map((r) => r.id)]
  const callTypes = ['RECRUIT', 'FOLLOW_UP', 'CLIENT_APPOINTMENT', 'OTHER'] as const
  const outcomes = ['RECRUITED', 'APPOINTMENT_BOOKED', 'FOLLOW_UP_SCHEDULED', 'NOT_INTERESTED', 'NO_CONTACT'] as const

  for (const ownerId of owners) {
    for (let i = 0; i < 4; i++) {
      const contactName = `${BP_FIRST[(i + 1) % BP_FIRST.length]} ${BP_LAST[(i + 4) % BP_LAST.length]}`
      const subject = `seedcall:${ownerId}:${i}`
      const existing = await db.callLog.findFirst({
        where: { agentProfileId: ownerId, subject },
        select: { id: true },
      })
      if (existing) {
        tally('CallLog', false)
        continue
      }
      const log = await db.callLog.create({
        data: {
          agentProfileId: ownerId,
          callDate: daysAgo(3 + i),
          contactName,
          phoneNumber: `(555) 6${String(i).padStart(2, '0')}-${5000 + i}`,
          subject,
          notes: 'Discussed financial goals and next steps.',
          result: i % 2 === 0 ? 'Positive' : 'Needs follow-up',
          outcome: outcomes[i % outcomes.length],
          callType: callTypes[i % callTypes.length],
          followUpNeeded: i % 2 === 0,
          durationSeconds: 600 + i * 120,
          transcriptText:
            'Agent: Thanks for taking my call. Prospect: Sure, what is this about? ...',
          transcriptSource: 'MANUAL_PASTE',
          createdAt: daysAgo(3 + i),
        },
      })
      tally('CallLog', true)

      // One CallReview per first call (callLogId is @unique).
      if (i === 0) {
        await db.callReview.create({
          data: {
            callLogId: log.id,
            agentProfileId: ownerId,
            overallScore: 78,
            rubricScores: { rapport: 8, discovery: 7, framing: 8, objections: 7, closing: 8, professionalism: 9 },
            strengths: ['Built rapport quickly', 'Asked good discovery questions'],
            weaknesses: ['Rushed the close', 'Missed an objection'],
            coachingTips: ['Slow down before asking for the appointment'],
            nextSteps: ['Practice the objection-handling script'],
            summary: 'Solid call overall with room to tighten the close.',
            modelId: 'seed-model',
            inputTokens: 0,
            outputTokens: 0,
            reviewedAt: daysAgo(2),
          },
        })
        tally('CallReview', true)
      }
    }
  }
}

// ─── 11. CoordinatorRequest + thread ─────────────────────────────────────────

async function ensureCoordinatorRequests(testProfileId: string, downline: ProfileRef[]) {
  const owners = [testProfileId, ...downline.filter((r) => r.phase === 1).slice(0, 3).map((r) => r.id)]
  const topics = ['SCHEDULE_EXAM', 'FINGERPRINTS_APPLY', 'CE_COURSES', 'EO_INSURANCE', 'GENERAL'] as const
  const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const

  for (const ownerId of owners) {
    for (let i = 0; i < 2; i++) {
      const message = `[seedlc:${ownerId}:${i}] I need help scheduling my licensing exam.`
      const existing = await db.coordinatorRequest.findFirst({
        where: { agentProfileId: ownerId, message },
        select: { id: true },
      })
      if (existing) {
        tally('CoordinatorRequest', false)
        continue
      }
      const status = statuses[i % statuses.length]
      const req = await db.coordinatorRequest.create({
        data: {
          agentProfileId: ownerId,
          topic: topics[i % topics.length],
          message,
          status,
          resolutionNote: status === 'RESOLVED' ? 'Exam scheduled, agent confirmed.' : null,
          resolvedAt: status === 'RESOLVED' ? daysAgo(1) : null,
          createdAt: daysAgo(6 + i),
        },
      })
      tally('CoordinatorRequest', true)

      await db.coordinatorMessage.create({
        data: {
          requestId: req.id,
          fromRole: 'agent',
          fromUserId: ownerId,
          fromName: 'Test Agent',
          body: 'Following up on this, any update?',
          createdAt: daysAgo(5 + i),
        },
      })
      tally('CoordinatorMessage', true)
    }
  }
}

// ─── 12. AgentReferral ───────────────────────────────────────────────────────

async function ensureReferrals(testProfileId: string, downline: ProfileRef[]) {
  const owners = [testProfileId, ...downline.filter((r) => r.status === 'ACTIVE').slice(0, 3).map((r) => r.id)]
  const statuses = ['PENDING', 'APPROVED', 'REJECTED'] as const

  for (const ownerId of owners) {
    for (let i = 0; i < 2; i++) {
      const refEmail = `referral.${ownerId.slice(-6)}.${i}@example.com`
      const existing = await db.agentReferral.findFirst({
        where: { referringAgentId: ownerId, email: refEmail },
        select: { id: true },
      })
      if (existing) {
        tally('AgentReferral', false)
        continue
      }
      const status = statuses[i % statuses.length]
      await db.agentReferral.create({
        data: {
          referringAgentId: ownerId,
          firstName: BP_FIRST[i % BP_FIRST.length],
          lastName: BP_LAST[(i + 2) % BP_LAST.length],
          email: refEmail,
          phone: `(555) 5${String(i).padStart(2, '0')}-${6000 + i}`,
          state: 'TX',
          notes: 'Great communicator, looking for a career change.',
          status,
          adminNotes: status !== 'PENDING' ? 'Reviewed by ops.' : null,
          approvedAt: status === 'APPROVED' ? daysAgo(2) : null,
          createdAt: daysAgo(8 + i),
        },
      })
      tally('AgentReferral', true)
    }
  }
}

// ─── 13. AgentArticle ────────────────────────────────────────────────────────

async function ensureArticles(testProfileId: string, downline: ProfileRef[]) {
  const owners = [testProfileId, ...downline.filter((r) => r.phase >= 3).slice(0, 3).map((r) => r.id)]
  const statuses = ['DRAFT', 'PUBLISHED', 'REJECTED'] as const

  for (const ownerId of owners) {
    const title = `My Journey to Fast Start [seed:${ownerId.slice(-6)}]`
    const existing = await db.agentArticle.findFirst({
      where: { agentProfileId: ownerId, title },
      select: { id: true },
    })
    if (existing) {
      tally('AgentArticle', false)
      continue
    }
    const status = statuses[ownerId.length % statuses.length]
    await db.agentArticle.create({
      data: {
        agentProfileId: ownerId,
        title,
        body: 'When I joined AFF I had no idea how fast things could move. Within my first 30 days...',
        status,
        publishedAt: status === 'PUBLISHED' ? daysAgo(3) : null,
        reviewedAt: status !== 'DRAFT' ? daysAgo(4) : null,
        generatedAt: daysAgo(6),
      },
    })
    tally('AgentArticle', true)
  }
}

// ─── 14. Announcement reads (test-account-scoped only) ───────────────────────
//
// We do NOT create Announcements (they are global). We only mark existing
// active announcements as "read" by our synthetic agents so the bell /
// banner state is realistic. Unique([announcementId, agentProfileId]).

async function ensureAnnouncementReads(testProfileId: string, downline: ProfileRef[]) {
  const anns = await db.announcement.findMany({
    where: { active: true },
    take: 5,
    select: { id: true },
  })
  if (anns.length === 0) return
  const readers = [testProfileId, ...downline.slice(0, 4).map((r) => r.id)]
  for (const readerId of readers) {
    for (const ann of anns.slice(0, 2)) {
      const existing = await db.announcementRead.findFirst({
        where: { announcementId: ann.id, agentProfileId: readerId },
        select: { id: true },
      })
      if (existing) {
        tally('AnnouncementRead', false)
        continue
      }
      await db.announcementRead.create({
        data: { announcementId: ann.id, agentProfileId: readerId, readAt: daysAgo(1) },
      })
      tally('AnnouncementRead', true)
    }
  }
}

// ─── 15. TrainingAttendance (only on existing TrainingEvents) ─────────────────
//
// We do NOT create TrainingEvents (global). We attach attendance rows for
// our synthetic agents to existing tracked events so the grid has data.
// Unique([trainingEventId, agentProfileId]).

async function ensureTrainingAttendance(testProfileId: string, downline: ProfileRef[]) {
  const events = await db.trainingEvent.findMany({
    where: { trackAttendance: true },
    orderBy: { startsAt: 'desc' },
    take: 4,
    select: { id: true },
  })
  if (events.length === 0) return
  const attendees = [testProfileId, ...downline.filter((r) => r.status === 'ACTIVE').slice(0, 8).map((r) => r.id)]
  const statuses = ['PRESENT', 'ABSENT', 'EXCUSED', 'PRESENT'] as const

  for (let e = 0; e < events.length; e++) {
    for (let a = 0; a < attendees.length; a++) {
      const existing = await db.trainingAttendance.findFirst({
        where: { trainingEventId: events[e].id, agentProfileId: attendees[a] },
        select: { id: true },
      })
      if (existing) {
        tally('TrainingAttendance', false)
        continue
      }
      const status = statuses[(e + a) % statuses.length]
      await db.trainingAttendance.create({
        data: {
          trainingEventId: events[e].id,
          agentProfileId: attendees[a],
          status,
          source: 'backfill',
          joinedAt: status === 'PRESENT' ? daysAgo(2) : null,
          durationSeconds: status === 'PRESENT' ? 3600 : null,
        },
      })
      tally('TrainingAttendance', true)
    }
  }
}

// ─── 16. PolicyEntry + comments + activity + views ───────────────────────────

async function ensurePolicies(testProfileId: string, downline: ProfileRef[]) {
  const owners = [testProfileId, ...downline.filter((r) => r.phase >= 3).slice(0, 3).map((r) => r.id)]
  for (const ownerId of owners) {
    for (let i = 0; i < 3; i++) {
      const policyNumber = `SEEDPOL-${ownerId.slice(-6)}-${i}`
      const existing = await db.policyEntry.findFirst({
        where: { agentProfileId: ownerId, policyNumber },
        select: { id: true },
      })
      if (existing) {
        tally('PolicyEntry', false)
        continue
      }
      const entry = await db.policyEntry.create({
        data: {
          agentProfileId: ownerId,
          policyNumber,
          clientName: `${BP_FIRST[i % BP_FIRST.length]} ${BP_LAST[(i + 5) % BP_LAST.length]}`,
          carrier: CARRIERS[i % CARRIERS.length],
          product: ['Term 20', 'IUL Builder', 'MYGA 5yr'][i % 3],
          dateSubmitted: daysAgo(15 + i * 3),
          targetPremium: 1200 + i * 300,
          targetPoints: 1500 + i * 350,
          commissionPayout: 800 + i * 200,
          notes: 'Seeded policy entry.',
          createdAt: daysAgo(16 + i * 3),
        },
      })
      tally('PolicyEntry', true)

      await db.policyComment.create({
        data: {
          policyEntryId: entry.id,
          agentProfileId: ownerId,
          body: 'Submitted, awaiting underwriting decision.',
          createdAt: daysAgo(14 + i * 3),
        },
      })
      tally('PolicyComment', true)

      await db.policyActivity.create({
        data: {
          policyEntryId: entry.id,
          actorProfileId: ownerId,
          kind: 'OTHER',
          metaJson: { seeded: true },
          createdAt: daysAgo(15 + i * 3),
        },
      })
      tally('PolicyActivity', true)

      await db.policyView.create({
        data: {
          policyEntryId: entry.id,
          agentProfileId: ownerId,
          lastViewedAt: daysAgo(1),
        },
      })
      tally('PolicyView', true)
    }
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Seeding test/demo data (scoped to test@allfinancialfreedom.com) ===\n')

  // Find an existing AdminUser purely for admin-authored note attribution.
  // We NEVER create or mutate AdminUser rows here.
  const admin = await db.adminUser.findFirst({ select: { id: true, email: true } })
  if (admin) {
    console.log(`Using existing admin for admin-authored notes: ${admin.email}`)
  } else {
    console.log('No AdminUser found — admin-authored notes will be skipped.')
  }
  const adminId = admin?.id ?? null

  const testProfileId = await ensureTestAgent()
  console.log(`Test agent profile id: ${testProfileId}`)

  const downline = await ensureDownline()
  console.log(`Synthetic downline agents: ${downline.length}`)

  await ensurePFRs(testProfileId, downline)
  await ensureBusinessPartners(testProfileId, downline)
  await ensureFTAs(testProfileId, downline)
  await ensureSubmissions(testProfileId, downline, adminId)
  await ensureFeedback(testProfileId, downline, adminId)
  await ensureNotifications(testProfileId, downline)
  await ensureRecognition(testProfileId, downline)
  await ensureCallLogs(testProfileId, downline)
  await ensureCoordinatorRequests(testProfileId, downline)
  await ensureReferrals(testProfileId, downline)
  await ensureArticles(testProfileId, downline)
  await ensureAnnouncementReads(testProfileId, downline)
  await ensureTrainingAttendance(testProfileId, downline)
  await ensurePolicies(testProfileId, downline)

  console.log('\n--- Summary (created / skipped) ---')
  for (const [model, c] of Object.entries(summary).sort()) {
    console.log(`  ${model.padEnd(34)} created=${c.created}  skipped=${c.skipped}`)
  }
  console.log(`\nLogin as the test agent at /agents/login`)
  console.log(`  Email:    ${TEST_EMAIL}`)
  console.log(`  Password: ${TEST_PASSWORD}\n`)

  await pool.end()
}

main().catch(async (e) => {
  console.error('Fatal error while seeding:', e)
  try {
    await pool.end()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
