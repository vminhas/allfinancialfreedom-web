import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeRenewalWindow, todayInEt, STAGE_LABELS } from '@/lib/renewals'

// Daily 9am ET digest of upcoming renewals to the admin Discord channel.
// Does NOT DM agents — that's the LC's call from /vault/renewals.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.newBusinessSubmission.findMany({
    where: { status: 'ISSUED', issuedDate: { not: null } },
    include: {
      agentProfile: { select: { firstName: true, lastName: true, agentCode: true } },
      renewalReminders: { select: { stage: true, anniversaryYear: true } },
    },
  })

  const today = todayInEt()
  const inWindow = rows
    .map(s => {
      const w = computeRenewalWindow(s.issuedDate!, today)
      return { s, w }
    })
    .filter(({ w }) => w.currentStage !== null)

  const buckets = {
    SIXTY_DAYS:  inWindow.filter(x => x.w.currentStage === 'SIXTY_DAYS'),
    THIRTY_DAYS: inWindow.filter(x => x.w.currentStage === 'THIRTY_DAYS'),
    SEVEN_DAYS:  inWindow.filter(x => x.w.currentStage === 'SEVEN_DAYS'),
  }

  const counts = {
    SIXTY_DAYS:  { total: buckets.SIXTY_DAYS.length,  sent: countSent(buckets.SIXTY_DAYS,  'SIXTY_DAYS') },
    THIRTY_DAYS: { total: buckets.THIRTY_DAYS.length, sent: countSent(buckets.THIRTY_DAYS, 'THIRTY_DAYS') },
    SEVEN_DAYS:  { total: buckets.SEVEN_DAYS.length,  sent: countSent(buckets.SEVEN_DAYS,  'SEVEN_DAYS') },
  }

  const everythingHandled =
    counts.SIXTY_DAYS.total + counts.THIRTY_DAYS.total + counts.SEVEN_DAYS.total === 0

  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const { sendChannelMessage } = await import('@/lib/discord')

    const lines = inWindow
      .sort((a, b) => a.w.daysUntilAnniversary - b.w.daysUntilAnniversary)
      .slice(0, 10)
      .map(({ s, w }) => `• **${s.clientFirstName} ${s.clientLastName}** (${s.agentProfile.firstName} ${s.agentProfile.lastName}) · ${w.daysUntilAnniversary}d · ${STAGE_LABELS[w.currentStage!]}`)

    const description = everythingHandled
      ? 'No renewals in the 60-day window today. Everyone is on track.'
      : [
          `**60d:** ${counts.SIXTY_DAYS.total} (${counts.SIXTY_DAYS.sent} reminded)`,
          `**30d:** ${counts.THIRTY_DAYS.total} (${counts.THIRTY_DAYS.sent} reminded)`,
          `**7d:** ${counts.SEVEN_DAYS.total} (${counts.SEVEN_DAYS.sent} reminded)`,
          '',
          ...lines,
        ].join('\n')

    sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
      embeds: [{
        title: 'Renewal Pipeline · Daily Digest',
        description,
        color: 0xC9A96E,
        footer: { text: 'AFF Concierge · Open /vault/renewals to send reminders' },
        timestamp: new Date().toISOString(),
      }],
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, counts })
}

function countSent(bucket: { s: { renewalReminders: { stage: string; anniversaryYear: number }[] }; w: { anniversaryYear: number } }[], stage: string): number {
  return bucket.filter(b => b.s.renewalReminders.some(r => r.stage === stage && r.anniversaryYear === b.w.anniversaryYear)).length
}
