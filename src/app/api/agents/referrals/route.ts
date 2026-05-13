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
  // The public #announcements celebration is intentionally NOT fired here —
  // it waits for approval and is posted from approveReferral() in
  // src/lib/referral-approval.ts. The CEO does not want the team celebrating
  // a recruit that staff hasn't reviewed yet.
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
      }).catch((err) => {
        console.error('[referrals] admin Discord ping failed:', err)
      })
    } catch (err) {
      console.error('[referrals] admin Discord ping threw:', err)
    }
  } else if (process.env.DISCORD_BOT_TOKEN && !process.env.DISCORD_ADMIN_CHANNEL_ID) {
    // Loud warning so we notice if the env var goes missing in prod —
    // silently dropping the approve/reject panel means referrals pile up
    // in the queue with no staff visibility.
    console.warn('[referrals] DISCORD_ADMIN_CHANNEL_ID not set; admin approve/reject panel will not post')
  }

  return NextResponse.json(referral)
}
