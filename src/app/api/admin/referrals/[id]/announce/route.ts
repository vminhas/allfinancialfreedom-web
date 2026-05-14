import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { buildAchievementEmbed } from '@/lib/discord-card'
import { displayFullName } from '@/lib/display-name'

// POST /api/admin/referrals/[id]/announce
//
// Re-fires the NEW_RECRUIT announcement card for a referral. Used to
// backfill announcements that landed as plain text under the old code
// path (anything submitted before the card family shipped). Idempotent
// from the agent's perspective — the original referral row isn't
// touched, we just post a fresh card.
//
// Admin-only because the announcements channel is public and we don't
// want agents triggering arbitrary re-announcements of stale referrals.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const referral = await db.agentReferral.findUnique({
    where: { id },
    include: {
      referringAgent: {
        select: {
          firstName: true,
          lastName: true,
          preferredName: true,
          agentCode: true,
          avatarUrl: true,
          discordUserId: true,
        },
      },
    },
  })
  if (!referral) {
    return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
  }
  if (!referral.referringAgent) {
    return NextResponse.json({ error: 'Referring agent not found' }, { status: 404 })
  }
  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  const referrer = referral.referringAgent
  const refName = displayFullName(referrer)
  const recruitName = `${referral.firstName} ${referral.lastName}`

  const card = buildAchievementEmbed({
    flavor: 'NEW_RECRUIT',
    protagonist: {
      firstName: referrer.firstName,
      lastName: referrer.lastName,
      preferredName: referrer.preferredName,
      agentCode: referrer.agentCode,
      avatarUrl: referrer.avatarUrl,
    },
    subline: `Welcome **${recruitName}** to the AFF family.`,
    fields: [
      { name: 'New Business Partner', value: recruitName, inline: true },
      { name: 'State',                value: referral.state ?? 'Not set', inline: true },
      { name: 'Shared by',            value: `${refName} (\`${referrer.agentCode}\`)`, inline: false },
    ],
  })

  const recruiterMention = referrer.discordUserId ? `<@${referrer.discordUserId}>` : `**${refName}**`
  const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'

  const { sendChannelMessage } = await import('@/lib/discord')
  const result = await sendChannelMessage(announcementsChannel, {
    content: `${recruiterMention} shared the opportunity with **${recruitName}**.`,
    embeds: [card],
  })

  return NextResponse.json({ ok: true, messageId: result.id })
}
