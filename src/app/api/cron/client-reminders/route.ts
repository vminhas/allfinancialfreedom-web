import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createNotification } from '@/lib/notify'

// GET /api/cron/client-reminders
//
// Daily 9am ET fire for client touchpoint reminders. Three kinds:
//
//   BIRTHDAY        — 5 days before each client's birthday. Period
//                     key is the calendar year so it re-fires each
//                     year cleanly.
//   THANK_YOU_30    — exactly 30 days after the policy issuedDate.
//                     One-shot; period key is the literal kind.
//   ANNUAL_REVIEW   — one year after issuedDate, then every year
//                     after that. Period key is the year offset
//                     ('1', '2', etc).
//
// Agents opt in per-reminder type via the toggle card on their
// profile page (writes AgentProfile.clientReminderPrefs as JSON).
//
// Idempotent: each fire upserts a ClientReminderFire row; the
// unique index on (agentProfileId, submissionId, kind, periodKey)
// makes a second run on the same day a no-op.
//
// Auth: Bearer CRON_SECRET (matches the renewal-digest cron).

export const maxDuration = 60

interface ReminderPrefs {
  birthday?: boolean
  thankYou30Day?: boolean
  annualReview?: boolean
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = todayInEt()
  const todayMonth = now.getMonth() + 1  // 1-12
  const todayDay = now.getDate()         // 1-31
  const todayYear = now.getFullYear()

  // Birthday reminders fire 5 days ahead so agents have time to grab
  // a card and stamp it. Compute the target date once.
  const birthdayTarget = new Date(now)
  birthdayTarget.setDate(birthdayTarget.getDate() + 5)
  const targetMonth = birthdayTarget.getMonth() + 1
  const targetDay = birthdayTarget.getDate()

  // Pull every issued submission with the data the cron actually
  // needs. We loop in-memory below; this is cheaper than 3 separate
  // queries per agent.
  const subs = await db.newBusinessSubmission.findMany({
    where: {
      status: 'ISSUED',
      issuedDate: { not: null },
      agentProfile: { status: 'ACTIVE', isTest: false },
    },
    select: {
      id: true,
      agentProfileId: true,
      clientFirstName: true,
      clientLastName: true,
      clientBirthday: true,
      issuedDate: true,
      carrier: true,
      policyType: true,
      agentProfile: { select: { clientReminderPrefs: true } },
    },
  })

  let firedBirthdays = 0
  let firedThankYou = 0
  let firedAnnual = 0
  let skipped = 0

  for (const s of subs) {
    const prefs = (s.agentProfile.clientReminderPrefs ?? {}) as ReminderPrefs

    // ─── Birthday ─────────────────────────────────────────────
    if (prefs.birthday && s.clientBirthday) {
      const bday = new Date(s.clientBirthday)
      const bMonth = bday.getMonth() + 1
      const bDay = bday.getDate()
      // Birthday year for the period key is the year the birthday
      // FALLS IN, not the year we're firing. Fire 5 days ahead of
      // Jan 2 birthday from Dec 28 still keys to year+1.
      if (bMonth === targetMonth && bDay === targetDay) {
        const periodYear = birthdayTarget.getFullYear()
        const fired = await fireOnce({
          agentProfileId: s.agentProfileId,
          submissionId: s.id,
          kind: 'BIRTHDAY',
          periodKey: `BIRTHDAY:${periodYear}`,
          title: `🎂 ${s.clientFirstName} ${s.clientLastName}'s birthday in 5 days`,
          body: `Their birthday is ${bday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Time to send a card.`,
          color: 0xF59E0B,
          subjectId: s.id,
        })
        if (fired) firedBirthdays++; else skipped++
      }
    }

    // ─── 30-day Thank You ─────────────────────────────────────
    if (prefs.thankYou30Day && s.issuedDate) {
      const target = new Date(s.issuedDate)
      target.setDate(target.getDate() + 30)
      if (sameYMD(target, now)) {
        const fired = await fireOnce({
          agentProfileId: s.agentProfileId,
          submissionId: s.id,
          kind: 'THANK_YOU_30',
          periodKey: 'THANK_YOU_30',
          title: `📝 Send ${s.clientFirstName} ${s.clientLastName} a thank-you card`,
          body: `It's been 30 days since their ${s.carrier} ${s.policyType.toLowerCase()} policy issued. Drop a note.`,
          color: 0x60A5FA,
          subjectId: s.id,
        })
        if (fired) firedThankYou++; else skipped++
      }
    }

    // ─── Annual Review ────────────────────────────────────────
    if (prefs.annualReview && s.issuedDate) {
      const issued = new Date(s.issuedDate)
      // Year offset: 1 = first anniversary, 2 = second, etc. Only
      // fire on the exact anniversary day.
      const monthsSince =
        (todayYear - issued.getFullYear()) * 12 + (now.getMonth() - issued.getMonth())
      const anniv = monthsSince >= 12 && monthsSince % 12 === 0 &&
        now.getDate() === issued.getDate()
      if (anniv) {
        const yearOffset = Math.floor(monthsSince / 12)
        const fired = await fireOnce({
          agentProfileId: s.agentProfileId,
          submissionId: s.id,
          kind: 'ANNUAL_REVIEW',
          periodKey: `ANNUAL_REVIEW:${yearOffset}`,
          title: `📅 Annual review with ${s.clientFirstName} ${s.clientLastName}`,
          body: `${yearOffset === 1 ? "It's been a year" : `${yearOffset} years`} since their ${s.carrier} policy issued. Schedule a check-in.`,
          color: 0xC9A96E,
          subjectId: s.id,
        })
        if (fired) firedAnnual++; else skipped++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    fired: { birthdays: firedBirthdays, thankYou: firedThankYou, annual: firedAnnual },
    skipped,
    scanned: subs.length,
  })
}

async function fireOnce(args: {
  agentProfileId: string
  submissionId: string
  kind: 'BIRTHDAY' | 'THANK_YOU_30' | 'ANNUAL_REVIEW'
  periodKey: string
  title: string
  body: string
  color: number
  subjectId: string
}): Promise<boolean> {
  // Insert the fire-log row first. The unique index on
  // (agentProfileId, submissionId, kind, periodKey) makes the second
  // attempt fail cleanly so a re-run of the cron is a no-op.
  try {
    await db.clientReminderFire.create({
      data: {
        agentProfileId: args.agentProfileId,
        submissionId: args.submissionId,
        kind: args.kind,
        periodKey: args.periodKey,
      },
    })
  } catch {
    // Unique violation → already fired today / earlier. Skip.
    return false
  }

  // In-app bell + Discord DM via existing notify helper.
  await createNotification({
    recipientAgentProfileId: args.agentProfileId,
    kind: `client_reminder.${args.kind.toLowerCase()}`,
    subjectType: 'new_business',
    subjectId: args.subjectId,
    title: args.title,
    body: args.body,
    linkUrl: `/agents?tab=new-business&submission=${args.subjectId}`,
    color: args.color,
    discord: {
      title: args.title,
      description: args.body,
      color: args.color,
    },
  }).catch(err => console.warn('[client-reminders] notify failed:', err))

  return true
}

function todayInEt(): Date {
  // Truncate to the start of day in America/New_York. Matches the
  // renewal-digest cron's tz reasoning so the two crons agree on
  // 'today'.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return new Date(`${y}-${m}-${d}T00:00:00-05:00`)
}

function sameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}
