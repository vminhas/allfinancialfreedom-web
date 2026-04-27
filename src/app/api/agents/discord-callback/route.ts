import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { assignDiscordPhaseRole, assignDiscordRole } from '@/lib/discord-roles'
import { cookies } from 'next/headers'

// GET /api/agents/discord-callback?code=...&state=...
// Discord redirects here after the agent authorizes. We exchange the code
// for an access token, fetch the user's Discord ID, save it, and assign
// their phase role.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const portalUrl = `${baseUrl}/agents`

  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')

  // Validate CSRF state
  const cookieStore = await cookies()
  const savedState = cookieStore.get('discord_oauth_state')?.value
  cookieStore.delete('discord_oauth_state')

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${portalUrl}?discord=error&reason=invalid_state`)
  }

  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.redirect(`${baseUrl}/agents/login`)
  }

  const clientId     = process.env.DISCORD_CLIENT_ID!
  const clientSecret = process.env.DISCORD_CLIENT_SECRET!
  const redirectUri  = `${baseUrl}/api/agents/discord-callback`

  // Exchange code for access token
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${portalUrl}?discord=error&reason=token_exchange`)
  }

  const tokenData = await tokenRes.json() as { access_token: string }

  // Fetch the Discord user
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })

  if (!userRes.ok) {
    return NextResponse.redirect(`${portalUrl}?discord=error&reason=user_fetch`)
  }

  const discordUser = await userRes.json() as { id: string; username: string; global_name?: string }

  // Save Discord user ID and assign phase role
  const agentUser = await db.agentUser.findUnique({
    where: { email: session.user!.email! },
    include: { profile: { select: { id: true, phase: true } } },
  })

  if (!agentUser?.profile) {
    return NextResponse.redirect(`${portalUrl}?discord=error&reason=no_profile`)
  }

  await db.agentProfile.update({
    where: { id: agentUser.profile.id },
    data: { discordUserId: discordUser.id },
  })

  // Assign Discord phase role + portal connected role (non-blocking)
  assignDiscordPhaseRole(discordUser.id, agentUser.profile.phase, null).catch(() => {})
  if (process.env.DISCORD_PORTAL_CONNECTED_ROLE_ID) {
    assignDiscordRole(discordUser.id, process.env.DISCORD_PORTAL_CONNECTED_ROLE_ID).catch(() => {})
  }

  // DM the agent confirming the connection
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: discordUser.id }),
      })
      if (dmChannelRes.ok) {
        const dmChannel = await dmChannelRes.json() as { id: string }
        await sendChannelMessage(dmChannel.id, {
          embeds: [{
            title: 'Discord Connected',
            description: "You're all set. Your portal account is now linked to Discord. You'll get training reminders and team updates here automatically.",
            color: 0x4ade80,
            footer: { text: 'All Financial Freedom' },
          }],
        })
      }
    } catch { /* non-fatal */ }
  }

  const displayName = discordUser.global_name ?? discordUser.username
  return NextResponse.redirect(
    `${portalUrl}?discord=connected&username=${encodeURIComponent(displayName)}`
  )
}
