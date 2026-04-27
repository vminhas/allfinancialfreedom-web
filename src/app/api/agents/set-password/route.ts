import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// POST /api/agents/set-password — accept invite and set password
export async function POST(req: NextRequest) {
  const { token, password } = await req.json() as { token: string; password: string }

  if (!token || !password) {
    return NextResponse.json({ error: 'token and password required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const agentUser = await db.agentUser.findUnique({
    where: { inviteToken: token },
    include: { profile: { select: { firstName: true, lastName: true, agentCode: true, state: true, phase: true } } },
  })
  if (!agentUser) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 400 })
  }
  if (!agentUser.inviteExpires || agentUser.inviteExpires < new Date()) {
    return NextResponse.json({ error: 'Invite link has expired' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await db.agentUser.update({
    where: { id: agentUser.id },
    data: { passwordHash, inviteToken: null, inviteExpires: null },
  })

  // Notify admin Discord channel that a new agent accepted their invite
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const p = agentUser.profile
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: 'New Agent Activated',
          description: [
            `**${p?.firstName} ${p?.lastName}** just accepted their invite and set up their portal account.`,
            '',
            `Agent Code: \`${p?.agentCode}\``,
            `State: ${p?.state ?? 'Not set'}`,
            `Email: ${agentUser.email}`,
            `Phase: ${p?.phase ?? 1}`,
          ].join('\n'),
          color: 0x4ade80,
          footer: { text: 'AFF Concierge · Agent Portal' },
          timestamp: new Date().toISOString(),
        }],
      })
    } catch {
      // Non-fatal — invite acceptance still succeeded
    }
  }

  return NextResponse.json({ ok: true, email: agentUser.email })
}
