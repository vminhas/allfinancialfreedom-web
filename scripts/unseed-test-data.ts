/**
 * Exact reverse of scripts/seed-test-data.ts.
 *
 *   Run with: npx tsx scripts/unseed-test-data.ts
 *
 * WHAT THIS IS
 * ------------
 * scripts/seed-test-data.ts attaches a large amount of synthetic demo
 * data to ONE designated account (`test@allfinancialfreedom.com`,
 * agentCode `TEST001`) plus a synthetic 16-agent downline it builds
 * (`TEST-D01`..`TEST-D16`, emails `test+d01@allfinancialfreedom.com`
 * ..`test+d16@...`). It ran against production and made a mess. This
 * script removes precisely and ONLY what that seeder created, using the
 * seeder's own deterministic markers.
 *
 * SAFETY GUARANTEE
 * ----------------
 * This script is scoped and SAFE TO RUN against production:
 *
 *   - It PRESERVES the base test account: the AgentUser
 *     `test@allfinancialfreedom.com` and its AgentProfile `TEST001` are
 *     NEVER deleted or mutated. Only the seed-ADDED rows that hang off
 *     TEST001 are removed, and only when they carry an unambiguous seed
 *     marker the seeder itself wrote (e.g. BusinessPartner notes
 *     containing `[seed:TEST001:<i>]`, policyNumber `SEED-TEST001-<i>`,
 *     Notification.subjectId `seed:<id>:<kind>`, CallLog.subject
 *     `seedcall:<id>:<i>`, etc.).
 *   - It DELETES the entire synthetic downline (the 16 `TEST-Dnn`
 *     agents matched by agentCode in that exact set AND isTest=true,
 *     plus their AgentUser by the `test+dnn@allfinancialfreedom.com`
 *     email set) and ALL their related rows, child-rows-first.
 *   - It NEVER deletes or mutates global / config rows the seed only
 *     READ or attached to (Settings, EmailTemplate, PhaseItemDefinition,
 *     Announcement, TrainingEvent, Contest, ClimbMilestone, AdminUser).
 *     For join rows (AnnouncementRead, TrainingAttendance) it only
 *     deletes rows whose agentProfileId belongs to a synthetic downline
 *     agent or which carry a seed marker; the parent Announcement /
 *     TrainingEvent is untouched.
 *   - It is fully idempotent: if nothing matches it deletes nothing and
 *     exits 0. Each model's deleted count is logged with a final
 *     summary. It exits non-zero only on a real fatal error.
 *
 * WHAT IT DOES NOT (CANNOT) PERFECTLY REVERSE
 * -------------------------------------------
 *   - For the base TEST001 account ONLY, two seeded models carry no
 *     per-row seed marker, so they are matched conservatively by the
 *     seeder's exact literal payload (see PFR + AnnouncementRead notes
 *     below). For the synthetic downline these same rows ARE removed
 *     unconditionally because the whole downline is synthetic.
 */

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = new PrismaClient({ adapter } as any)

// ─── Constants (mirror seed-test-data.ts exactly) ────────────────────────────

const TEST_EMAIL = 'test@allfinancialfreedom.com'
const TEST_CODE = 'TEST001'

// Synthetic downline: agentCodes TEST-D01..TEST-D16, emails
// test+d01@allfinancialfreedom.com..test+d16@... (DOWNLINE has n = 1..16).
const DOWNLINE_N = Array.from({ length: 16 }, (_, i) => i + 1)
function dcode(n: number): string {
  return `TEST-D${String(n).padStart(2, '0')}`
}
function demail(n: number): string {
  return `test+d${String(n).padStart(2, '0')}@allfinancialfreedom.com`
}
const DOWNLINE_CODES = DOWNLINE_N.map(dcode)
const DOWNLINE_EMAILS = DOWNLINE_N.map(demail)

// Exact literal payloads the seeder writes for the two models that have
// no per-row marker. Used ONLY to scope a delete on the base TEST001
// account (the synthetic downline is removed wholesale regardless).
const SEED_PFR_NOTES =
  'Reviewed during onboarding. Motivated, needs a savings system.'

// ─── Deletion tally ──────────────────────────────────────────────────────────

const deleted: Record<string, number> = {}
function note(model: string, count: number) {
  deleted[model] = (deleted[model] ?? 0) + count
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    '\n=== Unseeding test/demo data (reverse of seed-test-data.ts) ===\n',
  )

  // ── Resolve the base test agent (PRESERVED; only its seed children go) ──
  const testUser = await db.agentUser.findUnique({
    where: { email: TEST_EMAIL },
    include: { profile: { select: { id: true, agentCode: true } } },
  })
  const testProfileId: string | null = testUser?.profile?.id ?? null
  if (testProfileId) {
    console.log(
      `Base test agent found (PRESERVED): profile ${testProfileId} / ${
        testUser?.profile?.agentCode ?? '?'
      }`,
    )
  } else {
    console.log('Base test agent not found — only the downline will be cleared.')
  }

  // ── Resolve the synthetic downline profiles (DELETED entirely) ──
  // Belt-and-suspenders: agentCode in the exact TEST-Dnn set AND
  // isTest=true. We also resolve their AgentUsers by the exact email set.
  const downlineProfiles = await db.agentProfile.findMany({
    where: { agentCode: { in: DOWNLINE_CODES }, isTest: true },
    select: { id: true, agentUserId: true, agentCode: true },
  })
  const downlineProfileIds = downlineProfiles.map((p) => p.id)
  const downlineUserIdsFromProfiles = downlineProfiles.map((p) => p.agentUserId)

  // INVITED downline agents have no profile yet if the seed half-ran, but
  // the seeder always creates the AgentUser then the profile in sequence;
  // still, resolve users by the email set too so a partial seed is fully
  // reversed (and so we never orphan a user row).
  const downlineUsers = await db.agentUser.findMany({
    where: { email: { in: DOWNLINE_EMAILS } },
    select: { id: true, email: true },
  })
  const downlineUserIds = Array.from(
    new Set([
      ...downlineUserIdsFromProfiles,
      ...downlineUsers.map((u) => u.id),
    ]),
  )

  console.log(
    `Synthetic downline: ${downlineProfileIds.length} profiles, ` +
      `${downlineUserIds.length} users\n`,
  )

  // Profile-id set that owns "synthetic" rows we delete wholesale.
  const downlineSet = downlineProfileIds

  // ───────────────────────────────────────────────────────────────────────
  // Deletion runs CHILD ROWS FIRST, then parents, then the downline
  // profiles, then the downline users. Every delete is scoped either to
  // the synthetic-downline profile ids OR to an unambiguous TEST001 seed
  // marker. Nothing is deleted by a broad filter that could match real
  // data.
  // ───────────────────────────────────────────────────────────────────────

  // ── 16. Policies: PolicyView / PolicyActivity / PolicyComment cascade
  //        from PolicyEntry, but we delete children explicitly too.
  // TEST001 marker: policyNumber = `SEEDPOL-<profileId.slice(-6)>-<i>`.
  {
    const policyOwnerOr: { agentProfileId: string; policyNumber?: { startsWith: string } }[] =
      downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      policyOwnerOr.push({
        agentProfileId: testProfileId,
        policyNumber: { startsWith: `SEEDPOL-${testProfileId.slice(-6)}-` },
      })
    }
    const policies = await db.policyEntry.findMany({
      where: { OR: policyOwnerOr },
      select: { id: true },
    })
    const policyIds = policies.map((p) => p.id)
    if (policyIds.length) {
      const v = await db.policyView.deleteMany({
        where: { policyEntryId: { in: policyIds } },
      })
      note('PolicyView', v.count)
      const a = await db.policyActivity.deleteMany({
        where: { policyEntryId: { in: policyIds } },
      })
      note('PolicyActivity', a.count)
      const c = await db.policyComment.deleteMany({
        where: { policyEntryId: { in: policyIds } },
      })
      note('PolicyComment', c.count)
      const e = await db.policyEntry.deleteMany({
        where: { id: { in: policyIds } },
      })
      note('PolicyEntry', e.count)
    }
  }

  // ── 6. NewBusinessSubmission + activity + notes.
  // TEST001 marker: policyNumber = `SEED-TEST001-<i>`.
  {
    const subOr: {
      agentProfileId: string
      policyNumber?: { startsWith: string }
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      subOr.push({
        agentProfileId: testProfileId,
        policyNumber: { startsWith: `SEED-${TEST_CODE}-` },
      })
    }
    const subs = await db.newBusinessSubmission.findMany({
      where: { OR: subOr },
      select: { id: true },
    })
    const subIds = subs.map((s) => s.id)
    if (subIds.length) {
      const act = await db.newBusinessSubmissionActivity.deleteMany({
        where: { submissionId: { in: subIds } },
      })
      note('NewBusinessSubmissionActivity', act.count)
      const nbn = await db.newBusinessNote.deleteMany({
        where: { submissionId: { in: subIds } },
      })
      note('NewBusinessNote', nbn.count)
      // Mutes / renewal reminders are not created by the seed but cascade
      // anyway; clear them defensively for the synthetic submissions.
      const mut = await db.newBusinessSubmissionMute.deleteMany({
        where: { submissionId: { in: subIds } },
      })
      note('NewBusinessSubmissionMute', mut.count)
      const ren = await db.renewalReminder.deleteMany({
        where: { submissionId: { in: subIds } },
      })
      note('RenewalReminder', ren.count)
      const e = await db.newBusinessSubmission.deleteMany({
        where: { id: { in: subIds } },
      })
      note('NewBusinessSubmission', e.count)
    }
  }

  // ── 7. AgentFeedback + AgentFeedbackNote (notes cascade from feedback).
  // TEST001 marker: message contains `[seedfb:TEST001:<i>]`.
  {
    const fbOr: {
      agentProfileId: string
      message?: { contains: string }
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      fbOr.push({
        agentProfileId: testProfileId,
        message: { contains: `[seedfb:${TEST_CODE}:` },
      })
    }
    const fbs = await db.agentFeedback.findMany({
      where: { OR: fbOr },
      select: { id: true },
    })
    const fbIds = fbs.map((f) => f.id)
    if (fbIds.length) {
      const n = await db.agentFeedbackNote.deleteMany({
        where: { feedbackId: { in: fbIds } },
      })
      note('AgentFeedbackNote', n.count)
      const e = await db.agentFeedback.deleteMany({
        where: { id: { in: fbIds } },
      })
      note('AgentFeedback', e.count)
    }
    // Downline agents could also be the AUTHOR of feedback notes on
    // OTHER (real) feedback. The seed never does that — agent-authored
    // notes are only ever on the same owner's seeded feedback — so we do
    // NOT touch authorAgentProfileId here (that relation is SetNull on
    // delete anyway and is handled when downline profiles are removed).
  }

  // ── 11. CoordinatorRequest + CoordinatorMessage (messages cascade).
  // TEST001 marker: message contains `[seedlc:<testProfileId>:<i>]`.
  {
    const crOr: {
      agentProfileId: string
      message?: { contains: string }
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      crOr.push({
        agentProfileId: testProfileId,
        message: { contains: `[seedlc:${testProfileId}:` },
      })
    }
    const crs = await db.coordinatorRequest.findMany({
      where: { OR: crOr },
      select: { id: true },
    })
    const crIds = crs.map((r) => r.id)
    if (crIds.length) {
      const m = await db.coordinatorMessage.deleteMany({
        where: { requestId: { in: crIds } },
      })
      note('CoordinatorMessage', m.count)
      const e = await db.coordinatorRequest.deleteMany({
        where: { id: { in: crIds } },
      })
      note('CoordinatorRequest', e.count)
    }
  }

  // ── 10. CallLog + CallReview (review cascades from CallLog; we delete
  //        the review explicitly first too).
  // TEST001 marker: subject = `seedcall:<testProfileId>:<i>`.
  {
    const clOr: {
      agentProfileId: string
      subject?: { startsWith: string }
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      clOr.push({
        agentProfileId: testProfileId,
        subject: { startsWith: `seedcall:${testProfileId}:` },
      })
    }
    const logs = await db.callLog.findMany({
      where: { OR: clOr },
      select: { id: true },
    })
    const logIds = logs.map((l) => l.id)
    if (logIds.length) {
      const r = await db.callReview.deleteMany({
        where: { callLogId: { in: logIds } },
      })
      note('CallReview', r.count)
      const e = await db.callLog.deleteMany({
        where: { id: { in: logIds } },
      })
      note('CallLog', e.count)
    }
  }

  // ── 4. BusinessPartner.
  // TEST001 marker: notes contains `[seed:TEST001:<i>]`. (FTAs may
  // reference a BP via businessPartnerId with onDelete: SetNull, so
  // ordering vs FTAs is FK-safe either way; we still delete FTAs first
  // below to be tidy. ContactNote cascades from BusinessPartner.)
  {
    const bpOr: {
      agentProfileId: string
      notes?: { contains: string }
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      bpOr.push({
        agentProfileId: testProfileId,
        notes: { contains: `[seed:${TEST_CODE}:` },
      })
    }
    // FieldTrainingAppointment first (it has a SetNull FK to BP, and is
    // itself seeded — handled here in full).
    // TEST001 marker: notes contains `[seedfta:TEST001:<i>]`.
    const ftaOr: {
      agentProfileId: string
      notes?: { contains: string }
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      ftaOr.push({
        agentProfileId: testProfileId,
        notes: { contains: `[seedfta:${TEST_CODE}:` },
      })
    }
    const ftas = await db.fieldTrainingAppointment.findMany({
      where: { OR: ftaOr },
      select: { id: true },
    })
    const ftaIds = ftas.map((f) => f.id)
    if (ftaIds.length) {
      // PhaseItem has linkedFtaId (SetNull) — seed never links them, but
      // null them defensively so the FK can't block on any real linkage.
      await db.phaseItem.updateMany({
        where: { linkedFtaId: { in: ftaIds } },
        data: { linkedFtaId: null },
      })
      const e = await db.fieldTrainingAppointment.deleteMany({
        where: { id: { in: ftaIds } },
      })
      note('FieldTrainingAppointment', e.count)
    }

    const bps = await db.businessPartner.findMany({
      where: { OR: bpOr },
      select: { id: true },
    })
    const bpIds = bps.map((b) => b.id)
    if (bpIds.length) {
      const cn = await db.contactNote.deleteMany({
        where: { businessPartnerId: { in: bpIds } },
      })
      note('ContactNote', cn.count)
      const e = await db.businessPartner.deleteMany({
        where: { id: { in: bpIds } },
      })
      note('BusinessPartner', e.count)
    }
  }

  // ── 8. Notification.
  // TEST001 marker: subjectId = `seed:<recipientId>:<kind>`.
  {
    const nOr: {
      recipientAgentProfileId: string
      subjectId?: { startsWith: string }
    }[] = downlineSet.map((id) => ({ recipientAgentProfileId: id }))
    if (testProfileId) {
      nOr.push({
        recipientAgentProfileId: testProfileId,
        subjectId: { startsWith: `seed:${testProfileId}:` },
      })
    }
    const e = await db.notification.deleteMany({ where: { OR: nOr } })
    note('Notification', e.count)
  }

  // ── 9. RecognitionMilestone + ClimbAchievement.
  // RecognitionMilestone TEST001 marker: notes = 'Seeded recognition
  // milestone.' (exact literal the seeder writes for every seeded row).
  {
    const rmOr: {
      agentProfileId: string
      notes?: string
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      rmOr.push({
        agentProfileId: testProfileId,
        notes: 'Seeded recognition milestone.',
      })
    }
    const rm = await db.recognitionMilestone.deleteMany({ where: { OR: rmOr } })
    note('RecognitionMilestone', rm.count)

    // ClimbAchievement: seed only links to the FIRST climb milestone
    // (lowest pointThreshold) and stamps pointsAtAchievement =
    // pointThreshold + 500. For the synthetic downline we delete all of
    // theirs; for TEST001 we additionally require that exact
    // (milestone, pointsAtAchievement) signature so we never remove a
    // real Climb achievement.
    const firstMilestone = await db.climbMilestone.findFirst({
      orderBy: { pointThreshold: 'asc' },
      select: { id: true, pointThreshold: true },
    })
    if (downlineSet.length) {
      const d = await db.climbAchievement.deleteMany({
        where: { agentProfileId: { in: downlineSet } },
      })
      note('ClimbAchievement', d.count)
    }
    if (testProfileId && firstMilestone) {
      const t = await db.climbAchievement.deleteMany({
        where: {
          agentProfileId: testProfileId,
          milestoneId: firstMilestone.id,
          pointsAtAchievement: firstMilestone.pointThreshold + 500,
        },
      })
      note('ClimbAchievement', t.count)
    }
  }

  // ── 12. AgentReferral.
  // TEST001 marker: email = `referral.<testProfileId.slice(-6)>.<i>@example.com`.
  {
    const arOr: {
      referringAgentId: string
      email?: { startsWith: string }
    }[] = downlineSet.map((id) => ({ referringAgentId: id }))
    if (testProfileId) {
      arOr.push({
        referringAgentId: testProfileId,
        email: { startsWith: `referral.${testProfileId.slice(-6)}.` },
      })
    }
    const e = await db.agentReferral.deleteMany({ where: { OR: arOr } })
    note('AgentReferral', e.count)
  }

  // ── 13. AgentArticle.
  // TEST001 marker: title = `My Journey to Fast Start [seed:<id.slice(-6)>]`.
  {
    const aaOr: {
      agentProfileId: string
      title?: string
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      aaOr.push({
        agentProfileId: testProfileId,
        title: `My Journey to Fast Start [seed:${testProfileId.slice(-6)}]`,
      })
    }
    const e = await db.agentArticle.deleteMany({ where: { OR: aaOr } })
    note('AgentArticle', e.count)
  }

  // ── 14. AnnouncementRead (join row; parent Announcement untouched).
  // For the synthetic downline: delete all of theirs. For TEST001 the
  // seeder leaves NO per-row marker (it only sets readAt = daysAgo(1)),
  // so removing TEST001's read rows could discard a genuine "read" the
  // real test user clicked. We therefore DO NOT delete TEST001
  // AnnouncementRead rows — see header note. Downline-only here.
  if (downlineSet.length) {
    const e = await db.announcementRead.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('AnnouncementRead', e.count)
  }

  // ── 15. TrainingAttendance (join row; parent TrainingEvent untouched).
  // TEST001 marker: source = 'backfill' (Zoom sync uses 'zoom', manual
  // uses 'manual'); the seeder writes 'backfill' for every row.
  {
    const taOr: {
      agentProfileId: string
      source?: string
    }[] = downlineSet.map((id) => ({ agentProfileId: id }))
    if (testProfileId) {
      taOr.push({ agentProfileId: testProfileId, source: 'backfill' })
    }
    const e = await db.trainingAttendance.deleteMany({ where: { OR: taOr } })
    note('TrainingAttendance', e.count)
  }

  // ── 3. PersonalFinancialReview.
  // The seed creates a PFR for TEST001 ONLY if one did not already
  // exist; it stamps notes = SEED_PFR_NOTES. We delete TEST001's PFR
  // only when notes matches that exact literal (so a real PFR with
  // different notes is preserved). For the synthetic downline we delete
  // unconditionally (their whole profile is synthetic).
  {
    if (downlineSet.length) {
      const d = await db.personalFinancialReview.deleteMany({
        where: { agentProfileId: { in: downlineSet } },
      })
      note('PersonalFinancialReview', d.count)
    }
    if (testProfileId) {
      const t = await db.personalFinancialReview.deleteMany({
        where: { agentProfileId: testProfileId, notes: SEED_PFR_NOTES },
      })
      note('PersonalFinancialReview', t.count)
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Remaining synthetic-downline-only child rows, then the profiles +
  // users. These rows belong to profiles we are deleting wholesale, so
  // no per-row marker is needed; scope is strictly the downline ids.
  // We delete every child explicitly (belt-and-suspenders) so the
  // AgentProfile delete can't be blocked by a non-cascade relation.
  // ───────────────────────────────────────────────────────────────────────
  if (downlineSet.length) {
    // PhaseItem has a self-referential SetNull link (linkedAgentProfileId
    // pointing at a recruited agent). Null any link that points INTO the
    // downline first so deleting downline profiles can't trip the FK,
    // then delete the downline's own phase items.
    await db.phaseItem.updateMany({
      where: { linkedAgentProfileId: { in: downlineSet } },
      data: { linkedAgentProfileId: null },
    })
    const pi = await db.phaseItem.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('PhaseItem (downline)', pi.count)

    const ca = await db.carrierAppointment.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('CarrierAppointment (downline)', ca.count)

    // Defensive: any remaining downline-owned rows in tables the seed
    // does not write but which have a non-cascade FK to AgentProfile.
    // These deleteMany calls are no-ops when the seed didn't create
    // them, keeping the script idempotent and FK-safe.
    const ln = await db.licensingNote.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('LicensingNote (downline)', ln.count)
    const tex = await db.trainingAttendanceExclusion.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('TrainingAttendanceExclusion (downline)', tex.count)
    const za = await db.agentZoomAlias.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('AgentZoomAlias (downline)', za.count)
    const crf = await db.clientReminderFire.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('ClientReminderFire (downline)', crf.count)
    const cmc = await db.contestManualCheck.deleteMany({
      where: { agentProfileId: { in: downlineSet } },
    })
    note('ContestManualCheck (downline)', cmc.count)

    // Finally the AgentProfile rows, then the AgentUser rows. Profile is
    // deleted before user (AgentProfile.agentUser FK is non-cascade).
    const ap = await db.agentProfile.deleteMany({
      where: { id: { in: downlineSet } },
    })
    note('AgentProfile (downline)', ap.count)
  }

  if (downlineUserIds.length) {
    const au = await db.agentUser.deleteMany({
      where: { id: { in: downlineUserIds } },
    })
    note('AgentUser (downline)', au.count)
  }

  // ── Summary ──
  console.log('--- Deleted (per model) ---')
  const entries = Object.entries(deleted).sort()
  let total = 0
  if (entries.length === 0) {
    console.log('  (nothing matched — database already clean)')
  } else {
    for (const [model, count] of entries) {
      total += count
      console.log(`  ${model.padEnd(38)} deleted=${count}`)
    }
  }
  console.log(`\nTotal rows deleted: ${total}`)
  console.log(
    `Base test account preserved: ${TEST_EMAIL} / ${TEST_CODE}` +
      (testProfileId ? ` (profile ${testProfileId})` : ' (not present)') +
      '\n',
  )

  await pool.end()
}

main().catch(async (e) => {
  console.error('Fatal error while unseeding:', e)
  try {
    await pool.end()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
