// Agent self-serve email change, step 2: verification (commits the swap).
//
// Validates the token, swaps AgentUser.email for the pending value,
// clears the pending fields, stamps lastEmailChangeAt, and pings the
// admin Discord channel. Best-effort updates the GHL contact email
// so welcome / outreach emails route to the new address.
//
// GET because the agent clicks a link from their inbox; making it POST
// would require either an interstitial page or JavaScript-only flow,
// which is fragile across email clients. The token is single-use so
// idempotency-on-replay isn't a concern (already-consumed = 404).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGhlConfig, ghlPost, ghlPut } from '@/lib/ghl'

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/agents/email-verify?status=missing', req.url))
  }

  const user = await db.agentUser.findUnique({
    where: { pendingEmailToken: token },
    include: { profile: { select: { firstName: true, lastName: true } } },
  })
  if (!user || !user.pendingEmail || !user.pendingEmailExpires) {
    return NextResponse.redirect(new URL('/agents/email-verify?status=invalid', req.url))
  }
  if (user.pendingEmailExpires < new Date()) {
    return NextResponse.redirect(new URL('/agents/email-verify?status=expired', req.url))
  }

  const oldEmail = user.email
  const newEmail = user.pendingEmail

  // Last-second collision check: someone else may have grabbed this
  // email between request and verify. Race-safe enough for our scale.
  const collision = await db.agentUser.findFirst({
    where: {
      email: { equals: newEmail, mode: 'insensitive' },
      NOT: { id: user.id },
    },
    select: { id: true },
  })
  if (collision) {
    return NextResponse.redirect(new URL('/agents/email-verify?status=collision', req.url))
  }

  await db.agentUser.update({
    where: { id: user.id },
    data: {
      email: newEmail,
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpires: null,
      lastEmailChangeAt: new Date(),
    },
  })

  // Best-effort GHL contact email update so future welcome / outreach
  // emails route to the new address. Failures here don't block the
  // swap; the agent can still log in immediately with their new email.
  try {
    const config = await getGhlConfig()
    if (config.apiKey && config.locationId) {
      const searchRes = await fetch(
        `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${config.locationId}&email=${encodeURIComponent(oldEmail)}`,
        { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } }
      )
      if (searchRes.ok) {
        const data = await searchRes.json() as { contact?: { id: string } }
        if (data.contact?.id) {
          await ghlPut(`/contacts/${data.contact.id}`, { email: newEmail }, config).catch(() => {})
        } else {
          // No existing contact; create one tagged appropriately.
          await ghlPost('/contacts/', {
            locationId: config.locationId,
            email: newEmail,
            firstName: user.profile?.firstName,
            lastName: user.profile?.lastName,
            tags: ['agent-portal'],
          }, config).catch(() => {})
        }
      }
    }
  } catch { /* non-fatal */ }

  // Admin notification
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const firstName = user.profile?.firstName ?? oldEmail.split('@')[0]
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: '✅ Agent email changed',
          description: [
            `**${firstName}** confirmed their email change.`,
            '',
            `Was: \`${oldEmail}\``,
            `Now: \`${newEmail}\``,
          ].join('\n'),
          color: 0x4ADE80,
          footer: { text: 'AFF Concierge · Account audit' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {})
    } catch { /* non-fatal */ }
  }

  return NextResponse.redirect(new URL('/agents/email-verify?status=ok', req.url))
}
