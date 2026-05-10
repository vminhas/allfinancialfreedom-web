import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getContestParticipants } from '@/lib/contests'

// POST /api/admin/contests/[id]/at-risk-post
//
// Generate a paste-ready Discord post listing agents at risk of
// missing the bonus. Mirrors the URGENT URGENT format the team
// already uses. Returns text only — admin pastes into Discord
// themselves so we don't accidentally spam the channel.
//
// Body: { thresholdDays?: number = 7 }
//   At-risk = days remaining ≤ threshold AND not yet qualified.

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({})) as { thresholdDays?: number }
  const threshold = body.thresholdDays ?? 7

  const contest = await db.contest.findUnique({
    where: { id },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })
  if (!contest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const participants = await getContestParticipants(id)
  const atRisk = participants
    .filter(p => !p.qualified && !p.expired && p.daysRemaining <= threshold)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)

  // Pull discordUserId for each so we can @mention if available.
  const ids = atRisk.map(p => p.agentProfileId)
  const discordById = ids.length === 0
    ? new Map<string, string | null>()
    : new Map(
        (await db.agentProfile.findMany({
          where: { id: { in: ids } },
          select: { id: true, discordUserId: true },
        })).map(p => [p.id, p.discordUserId])
      )

  const reward = contest.rewardLabel
    ?? (contest.rewardAmount != null ? `$${contest.rewardAmount.toLocaleString()}` : 'this bonus')

  const lines = [
    '🚨🚨URGENT URGENT🚨🚨',
    '',
    `The following agents are at risk of missing their ${reward} ${contest.title}!!!!`,
    '',
    ...atRisk.map(p => {
      const discordId = discordById.get(p.agentProfileId)
      const mention = discordId ? `<@${discordId}>` : `${p.firstName} ${p.lastName}`
      return `${mention} - ${p.agentCode} - ${p.daysRemaining} day${p.daysRemaining === 1 ? '' : 's'}`
    }),
    '',
    `Remember the following steps have to be completed within ${contest.durationDays ?? '—'} days of your ${anchorLabel(contest.anchor)}!!!`,
    '',
    ...contest.requirements.map((r, i) => `${i + 1}. ${r.label}`),
    '',
    'Do not wait until the last day. Get this done.',
  ]

  return NextResponse.json({
    text: lines.join('\n'),
    atRiskCount: atRisk.length,
    threshold,
  })
}

function anchorLabel(anchor: string): string {
  switch (anchor) {
    case 'ICA_DATE':    return 'ICA date'
    case 'ONBOARDING':  return 'onboarding'
    case 'PHASE_START': return 'phase start'
    case 'FIXED':       return 'window'
    default:            return 'start'
  }
}
