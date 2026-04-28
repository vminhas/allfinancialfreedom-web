import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function getProfileId(email: string) {
  const u = await db.agentUser.findUnique({
    where: { email },
    include: { profile: { select: { id: true } } },
  })
  return u?.profile?.id ?? null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const referrals = await db.agentReferral.findMany({
    where: { referringAgentId: profileId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ referrals })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Pull the referrer's name for the Discord ping below.
  const referrer = await db.agentProfile.findUnique({
    where: { id: profileId },
    select: { firstName: true, lastName: true, agentCode: true },
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
    return NextResponse.json({ error: 'This person has already been referred' }, { status: 409 })
  }

  const existingAgent = await db.agentUser.findUnique({
    where: { email: body.email.toLowerCase() },
  })
  if (existingAgent) {
    return NextResponse.json({ error: 'This person is already an agent' }, { status: 409 })
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

  return NextResponse.json(referral)
}
