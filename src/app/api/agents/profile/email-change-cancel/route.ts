// Agent self-serve email change, step 3: cancel.
//
// The "wasn't me" link from the security alert email points here.
// Clears the pending fields without changing the actual email so the
// agent stays on their old address. Pings the admin channel because
// a cancel signal is a possible account-takeover indicator worth
// surfacing in real time.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/agents/email-cancel?status=missing', req.url))
  }

  const user = await db.agentUser.findUnique({
    where: { pendingEmailToken: token },
    include: { profile: { select: { firstName: true } } },
  })
  if (!user || !user.pendingEmail) {
    return NextResponse.redirect(new URL('/agents/email-cancel?status=invalid', req.url))
  }

  const oldEmail = user.email
  const attemptedEmail = user.pendingEmail

  await db.agentUser.update({
    where: { id: user.id },
    data: { pendingEmail: null, pendingEmailToken: null, pendingEmailExpires: null },
  })

  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const firstName = user.profile?.firstName ?? oldEmail.split('@')[0]
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: '🛑 Agent email change CANCELLED',
          description: [
            `**${firstName}** cancelled an email change request from the security alert email.`,
            '',
            `Account: \`${oldEmail}\``,
            `Attempted change to: \`${attemptedEmail}\``,
            '',
            '_This may indicate someone else accessed their account. Reach out to confirm._',
          ].join('\n'),
          color: 0xEF4444,
          footer: { text: 'AFF Concierge · Account audit' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {})
    } catch { /* non-fatal */ }
  }

  return NextResponse.redirect(new URL('/agents/email-cancel?status=ok', req.url))
}
