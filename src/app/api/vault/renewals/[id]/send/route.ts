import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { computeRenewalWindow, todayInEt, STAGE_LABELS } from '@/lib/renewals'
import { createGhlRenewalTask } from '@/lib/ghl-renewals'
import type { RenewalStage } from '@/generated/prisma/client'

const VALID_STAGES: RenewalStage[] = ['SIXTY_DAYS', 'THIRTY_DAYS', 'SEVEN_DAYS']

async function dmAgentRenewal(discordUserId: string, body: {
  clientName: string
  carrier: string
  daysUntil: number
  stage: RenewalStage
}): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: discordUserId }),
  })
  if (!dmRes.ok) return
  const dm = await dmRes.json() as { id: string }
  const { sendChannelMessage } = await import('@/lib/discord')
  await sendChannelMessage(dm.id, {
    embeds: [{
      title: 'Policy Anniversary Coming Up',
      description: [
        `**${body.clientName}**'s ${body.carrier} policy anniversary is in ${body.daysUntil} day${body.daysUntil === 1 ? '' : 's'}.`,
        '',
        'Schedule a check-in call: review their coverage, ask about life changes, and explore next-step products.',
      ].join('\n'),
      color: 0xC9A96E,
      footer: { text: `AFF Concierge · ${STAGE_LABELS[body.stage]} reminder` },
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => {})
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const adminId = (session!.user as { id: string }).id
  const { id } = await ctx.params
  const body = await req.json() as { stage?: string }
  const requestedStage = body.stage as RenewalStage | undefined
  if (!requestedStage || !VALID_STAGES.includes(requestedStage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
  }

  const submission = await db.newBusinessSubmission.findUnique({
    where: { id },
    include: { agentProfile: { select: { firstName: true, lastName: true, discordUserId: true } } },
  })
  if (!submission || submission.status !== 'ISSUED' || !submission.issuedDate) {
    return NextResponse.json({ error: 'Not an issued submission' }, { status: 404 })
  }

  // Recompute server-side and reject if the UI is stale (window has drifted).
  const w = computeRenewalWindow(submission.issuedDate, todayInEt())
  if (w.currentStage !== requestedStage) {
    return NextResponse.json({
      error: `Stage drift: server sees ${w.currentStage ?? 'no active stage'}, you sent ${requestedStage}. Refresh and try again.`,
    }, { status: 409 })
  }

  // Insert the reminder row. Unique constraint guarantees idempotency per
  // (submission, stage, anniversaryYear).
  try {
    await db.renewalReminder.create({
      data: {
        submissionId: id,
        stage: requestedStage,
        anniversaryYear: w.anniversaryYear,
        sentByAdminId: adminId,
      },
    })
  } catch (err) {
    const msg = (err as { code?: string }).code === 'P2002'
      ? 'Reminder already sent for this stage and year'
      : 'Failed to record reminder'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const agentName = `${submission.agentProfile.firstName} ${submission.agentProfile.lastName}`
  const clientName = `${submission.clientFirstName} ${submission.clientLastName}`

  // DM the agent
  if (submission.agentProfile.discordUserId) {
    dmAgentRenewal(submission.agentProfile.discordUserId, {
      clientName,
      carrier: submission.carrier,
      daysUntil: w.daysUntilAnniversary,
      stage: requestedStage,
    }).catch(() => {})
  }

  // LC audit trail in admin channel — single line, no embed
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const { sendChannelMessage } = await import('@/lib/discord')
    sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
      content: `✓ Renewal reminder (${STAGE_LABELS[requestedStage]}) sent to ${agentName} for **${clientName}**`,
    }).catch(() => {})
  }

  // GHL handoff stub — logs only until the env flag is flipped.
  createGhlRenewalTask({
    submissionId: id,
    agentName,
    clientName,
    clientEmail: submission.clientEmail,
    clientPhone: submission.clientPhone,
    carrier: submission.carrier,
    policyNumber: submission.policyNumber,
    daysUntilAnniversary: w.daysUntilAnniversary,
    nextAnniversary: w.nextAnniversary,
  }).catch(() => {})

  return NextResponse.json({ ok: true, anniversaryYear: w.anniversaryYear })
}
