import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const referrals = await db.agentReferral.findMany({
    where: { referringAgentId: id.profileId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ referrals })
}

export async function POST(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error
  const profileId = id.profileId

  // Pull the referrer's name for the Discord ping below.
  const referrer = await db.agentProfile.findUnique({
    where: { id: profileId },
    select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true, discordUserId: true },
  })

  const body = await req.json() as {
    firstName: string
    lastName: string
    email: string
    phone?: string
    state?: string
    notes?: string
  }

  if (!body.firstName || !body.lastName || !body.email) {
    return NextResponse.json({ error: 'firstName, lastName, email required' }, { status: 400 })
  }

  const existing = await db.agentReferral.findFirst({
    where: { email: body.email.toLowerCase(), status: { not: 'REJECTED' } },
  })
  if (existing) {
    return NextResponse.json({
      error: `This email (${body.email.toLowerCase()}) is already in your referral queue. Check "My Referrals" to see its status — no need to resubmit. If you're trying to refer someone different, double-check the email.`,
    }, { status: 409 })
  }

  const existingAgent = await db.agentUser.findUnique({
    where: { email: body.email.toLowerCase() },
  })
  if (existingAgent) {
    return NextResponse.json({
      error: `This email (${body.email.toLowerCase()}) belongs to an existing AFF agent, so we can't add them as a new referral. If you meant to refer someone else, double-check the email.`,
    }, { status: 409 })
  }

  const referral = await db.agentReferral.create({
    data: {
      referringAgentId: profileId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email.toLowerCase(),
      phone: body.phone,
      state: body.state,
      notes: body.notes,
    },
  })

  // Fire-and-forget Discord ping so admins/LC see new pending approvals
  // without having to refresh the inbox. Includes Approve / Reject buttons
  // wired to /api/discord/interactions so the LC can act without leaving Discord.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const refName = referrer ? `${referrer.firstName} ${referrer.lastName}` : 'An agent'
      sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: 'New Agent Referral',
          description: [
            `**${refName}** referred **${body.firstName} ${body.lastName}** to the team.`,
            '',
            `Email: ${body.email.toLowerCase()}`,
            body.phone ? `Phone: ${body.phone}` : '',
            body.state ? `State: ${body.state}` : '',
            body.notes ? `\nNotes: ${body.notes}` : '',
            '',
            '_Approve to send the welcome email and create the portal account._',
          ].filter(Boolean).join('\n'),
          color: 0xC9A96E,
          timestamp: new Date().toISOString(),
          footer: { text: 'AFF Concierge · Referrals' },
        }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Approve & Send Invite', custom_id: `referral-approve:${referral.id}` },
            { type: 2, style: 4, label: 'Reject',                custom_id: `referral-reject:${referral.id}` },
          ],
        }],
      }).catch(() => {})
    } catch { /* non-fatal */ }
  }

  // Public-facing celebration in #announcements: matches the promotion
  // pattern (single-line content, no embed) so the team sees the recruit
  // pipeline grow in real time. Fires alongside the admin ping above so
  // the LC can still triage in their own channel.
  if (process.env.DISCORD_BOT_TOKEN && referrer) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const { buildAchievementEmbed } = await import('@/lib/discord-card')
      const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
      const refName = `${referrer.firstName} ${referrer.lastName}`
      const recruitName = `${body.firstName} ${body.lastName}`

      // Tag the recruiter so Discord notifies them. Discord doesn't
      // resolve mentions inside embed body text, so we put the @-tag
      // in the message content alongside the embed.
      const recruiterMention = referrer.discordUserId ? `<@${referrer.discordUserId}>` : `**${refName}**`
      const card = buildAchievementEmbed({
        flavor: 'NEW_RECRUIT',
        // The recruiter is the visual protagonist on this card — they
        // brought someone in. Recruit's identity goes in the fields.
        protagonist: {
          firstName: referrer.firstName,
          lastName: referrer.lastName,
          agentCode: referrer.agentCode,
          avatarUrl: referrer.avatarUrl,
        },
        subline: `Welcome **${recruitName}** to the AFF family.`,
        fields: [
          { name: 'Recruit',  value: recruitName, inline: true },
          { name: 'State',    value: body.state ?? 'Not set', inline: true },
          { name: 'Recruited by', value: `${refName} (\`${referrer.agentCode}\`)`, inline: false },
        ],
      })

      sendChannelMessage(announcementsChannel, {
        content: `${recruiterMention} brought a new agent to the team! Let's go!`,
        embeds: [card],
      }).catch(() => {})
    } catch { /* non-fatal */ }
  }

  return NextResponse.json(referral)
}
