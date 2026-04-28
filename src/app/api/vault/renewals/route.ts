import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { computeRenewalWindow, todayInEt } from '@/lib/renewals'
import type { RenewalStage } from '@/generated/prisma/client'

const VALID_STAGES: RenewalStage[] = ['SIXTY_DAYS', 'THIRTY_DAYS', 'SEVEN_DAYS']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const stageFilter = new URL(req.url).searchParams.get('stage')

  // Pull issued submissions with their reminder history. We compute the
  // window in JS rather than SQL because anniversaries don't store cleanly.
  const rows = await db.newBusinessSubmission.findMany({
    where: { status: 'ISSUED', issuedDate: { not: null } },
    include: {
      agentProfile: { select: { id: true, firstName: true, lastName: true, agentCode: true, discordUserId: true } },
      renewalReminders: {
        orderBy: { sentAt: 'desc' },
        include: { sentBy: { select: { name: true } } },
      },
    },
  })

  const today = todayInEt()
  const enriched = rows.map(s => {
    const w = computeRenewalWindow(s.issuedDate!, today)
    return {
      id: s.id,
      clientFirstName: s.clientFirstName,
      clientLastName: s.clientLastName,
      carrier: s.carrier,
      policyType: s.policyType,
      policyNumber: s.policyNumber,
      issuedDate: s.issuedDate,
      points: s.points,
      agentProfile: s.agentProfile,
      daysUntilAnniversary: w.daysUntilAnniversary,
      currentStage: w.currentStage,
      anniversaryYear: w.anniversaryYear,
      // Only the reminders for THIS anniversary year matter for the "Send" UI.
      remindersThisYear: s.renewalReminders.filter(r => r.anniversaryYear === w.anniversaryYear),
      // All reminders sorted desc — used by the "Recently sent" section.
      allReminders: s.renewalReminders,
    }
  })

  const filtered = stageFilter && VALID_STAGES.includes(stageFilter as RenewalStage)
    ? enriched.filter(e => e.currentStage === stageFilter)
    : enriched

  filtered.sort((a, b) => a.daysUntilAnniversary - b.daysUntilAnniversary)

  return NextResponse.json({ submissions: filtered })
}
