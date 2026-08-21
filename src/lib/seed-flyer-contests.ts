import { db } from '@/lib/db'

// One-time seed for the two flyer competitions, built on the existing Contest
// engine (FIXED window + requirements + reward). Idempotent: a contest is
// created only if one with the same title doesn't already exist, so hitting
// the seed twice never duplicates and never clobbers admin edits.
//
// Windows are stored in UTC. Eastern offsets for summer 2026 (all EDT, -04:00):
//   Jun 1 2026 00:00 ET  = 2026-06-01T04:00:00Z
//   Aug 20 2026 00:00 ET = 2026-08-20T04:00:00Z
//   Aug 31 2026 23:59:59 ET = 2026-09-01T03:59:59Z
const AUG_START = new Date('2026-08-20T04:00:00Z')
const JUN_START = new Date('2026-06-01T04:00:00Z')
const AUG_END = new Date('2026-09-01T03:59:59Z')

type ReqType = 'RECRUITS' | 'POLICIES' | 'CUSTOM_TEXT'
interface ReqSeed { label: string; type: ReqType; count?: number }
interface ContestSeed {
  title: string
  description: string
  rewardAmount?: number
  rewardLabel: string
  fixedStartAt: Date
  fixedEndAt: Date
  requirements: ReqSeed[]
}

const SUMMER_REWARD = 'Summer Sizzler Leadership Summit · Impact Player Jersey · Top 25 Performance Bonus ($5,000)'

const CONTESTS: ContestSeed[] = [
  // ── All Out August: two reward tiers → two contests. Fully auto-tracked:
  // "Business Partner" = a recruit, "Family Helped" = an issued policy. ──
  {
    title: 'All Out August · Tier 1 — Path to Partnership',
    description: 'Contest for tonight through the end of the month. Help 1 family and bring on 1 business partner. If the policy does not hit this month, it does not count.',
    rewardLabel: '1-on-1 coaching session with Vick Minhas (#1 Overall Path to Partnership qualifier) — a clear path to 6 figures in 6 months.',
    fixedStartAt: AUG_START, fixedEndAt: AUG_END,
    requirements: [
      { label: '1 Business Partner', type: 'RECRUITS', count: 1 },
      { label: '1 Family Helped (policy issued this month)', type: 'POLICIES', count: 1 },
    ],
  },
  {
    title: 'All Out August · Tier 2 — Senior Associate',
    description: 'Contest for tonight through the end of the month. Help 2 families and bring on 2 business partners. If the policy does not hit this month, it does not count.',
    rewardLabel: 'Senior Associate promotion — plus all future policies paid out with a 25% pay increase.',
    fixedStartAt: AUG_START, fixedEndAt: AUG_END,
    requirements: [
      { label: '2 Business Partners', type: 'RECRUITS', count: 2 },
      { label: '2 Families Helped (policies issued this month)', type: 'POLICIES', count: 2 },
    ],
  },
  // ── Summer Sizzler (June–August), two divisions. The point minimums are
  // display goals (base/personal point rollups aren't auto-computed); the
  // recruit minimum auto-tracks for the personal (SMD & Below) division. ──
  {
    title: 'Summer Sizzler · Top 50 Base Shops',
    description: 'Summer Sizzler (June–August), Base Shops division. Scoring: 1,000 base points = 1,000 points; 1 base recruit = 1,000 points. Top 25 earn the $5,000 Performance Bonus.',
    rewardAmount: 5000, rewardLabel: SUMMER_REWARD,
    fixedStartAt: JUN_START, fixedEndAt: AUG_END,
    requirements: [
      { label: 'Minimum: 100,000 base points', type: 'CUSTOM_TEXT' },
      { label: 'Minimum: 20 base recruits', type: 'CUSTOM_TEXT' },
    ],
  },
  {
    title: 'Summer Sizzler · Top 50 SMD & Below',
    description: 'Summer Sizzler (June–August), SMD & Below division. Scoring: 1,000 personal points = 1,000 points; 1 personal recruit = 1,000 points. Top 25 earn the $5,000 Performance Bonus.',
    rewardAmount: 5000, rewardLabel: SUMMER_REWARD,
    fixedStartAt: JUN_START, fixedEndAt: AUG_END,
    requirements: [
      { label: 'Minimum: 25,000 personal points', type: 'CUSTOM_TEXT' },
      { label: 'Minimum: 6 personal directs', type: 'RECRUITS', count: 6 },
    ],
  },
]

export async function seedFlyerContests(): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = []
  const skipped: string[] = []
  for (const c of CONTESTS) {
    const existing = await db.contest.findFirst({ where: { title: c.title }, select: { id: true } })
    if (existing) { skipped.push(c.title); continue }
    await db.contest.create({
      data: {
        title: c.title,
        description: c.description,
        rewardAmount: c.rewardAmount ?? null,
        rewardLabel: c.rewardLabel,
        anchor: 'FIXED',
        fixedStartAt: c.fixedStartAt,
        fixedEndAt: c.fixedEndAt,
        active: true,
        requirements: {
          create: c.requirements.map((r, i) => ({
            order: i,
            label: r.label,
            type: r.type,
            count: r.count ?? null,
          })),
        },
      },
    })
    created.push(c.title)
  }
  return { created, skipped }
}
