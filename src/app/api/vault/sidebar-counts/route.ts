import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { computeRenewalWindow, todayInEt } from '@/lib/renewals'

// Counts that drive the sidebar notification badges. Each number is the
// "this needs attention" count for a given vault page. Cheap aggregate
// queries — designed to run on every sidebar render without thrashing
// the DB.
//
// Behaviour notes:
//   - referrals: only counts PENDING (not approved or rejected)
//   - newBusiness: only counts PENDING submissions that nobody has
//     claimed yet (assignedToId IS NULL). Once an LC clicks "Assign
//     to me" the row is in flight and shouldn't keep firing the
//     sidebar alert; the assignee can still see total Pending on the
//     vault/new-business KPI strip.
//   - renewals: counts issued submissions inside an active stage window
//     (60/30/7 day) where no reminder for the current anniversary year
//     has been sent yet
//   - licensing: counts OPEN coordinator requests (LCs see only their
//     assigned + unassigned to keep noise down)
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const role = (session!.user as { role?: string }).role
  const selfId = (session!.user as { id?: string }).id ?? null

  // Cheap snapshot counts in parallel.
  const [referralsPending, newBusinessPending, licensingOpen, renewalCandidates] = await Promise.all([
    db.agentReferral.count({ where: { status: 'PENDING' } }),
    db.newBusinessSubmission.count({ where: { status: 'PENDING', assignedToId: null } }),
    db.coordinatorRequest.count({
      where: role === 'licensing_coordinator' && selfId
        ? { status: 'OPEN', OR: [{ assignedToId: selfId }, { assignedToId: null }] }
        : { status: 'OPEN' },
    }),
    // Renewals can't be filtered with a plain SQL count — anniversary
    // windowing needs JS. Pull the candidate set + reminder list and
    // bucket here. Keep the projection thin so we're not transferring
    // full submission rows.
    db.newBusinessSubmission.findMany({
      where: { status: 'ISSUED', issuedDate: { not: null } },
      select: {
        issuedDate: true,
        renewalReminders: { select: { stage: true, anniversaryYear: true } },
      },
    }),
  ])

  const today = todayInEt()
  let renewalsToSend = 0
  for (const s of renewalCandidates) {
    const w = computeRenewalWindow(s.issuedDate!, today)
    if (!w.currentStage) continue
    const alreadySent = s.renewalReminders.some(
      r => r.stage === w.currentStage && r.anniversaryYear === w.anniversaryYear
    )
    if (!alreadySent) renewalsToSend++
  }

  return NextResponse.json({
    referralsPending,
    newBusinessPending,
    licensingOpen,
    renewalsToSend,
  })
}
