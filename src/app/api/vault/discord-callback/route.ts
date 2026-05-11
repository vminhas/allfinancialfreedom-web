import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

// GET /api/vault/discord-callback
//
// Receives the OAuth code from Discord, exchanges it for a token,
// fetches the staff member's Discord identity, and saves the
// discordUserId + discordUsername on their AdminUser row. Sends a
// confirmation DM so they can verify it landed on the right account.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const settingsUrl = `${baseUrl}/vault/settings`

  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')
  const oauthErrorDescription = (searchParams.get('error_description') ?? '').toLowerCase()

  if (oauthError) {
    const looksLikeVerificationBlock =
      oauthErrorDescription.includes('verified') ||
      oauthErrorDescription.includes('verification')
    const reason = looksLikeVerificationBlock
      ? 'unverified'
      : oauthError === 'access_denied'
        ? 'cancelled'
        : 'oauth_error'
    return NextResponse.redirect(`${settingsUrl}?discord=error&reason=${reason}`)
  }

  const cookieStore = await cookies()
  const savedState = cookieStore.get('vault_discord_oauth_state')?.value
  cookieStore.delete('vault_discord_oauth_state')

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${settingsUrl}?discord=error&reason=invalid_state`)
  }

  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.redirect(`${baseUrl}/vault/login`)
  }
  const adminUserId = (session.user as { id?: string }).id
  if (!adminUserId) {
    return NextResponse.redirect(`${settingsUrl}?discord=error&reason=no_user_id`)
  }

  const clientId     = process.env.DISCORD_CLIENT_ID!
  const clientSecret = process.env.DISCORD_CLIENT_SECRET!
  const redirectUri  = `${baseUrl}/api/vault/discord-callback`

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
    return NextResponse.redirect(`${settingsUrl}?discord=error&reason=token_exchange`)
  }
  const tokenData = await tokenRes.json() as { access_token: string }

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!userRes.ok) {
    return NextResponse.redirect(`${settingsUrl}?discord=error&reason=user_fetch`)
  }
  const discordUser = await userRes.json() as { id: string; username: string; global_name?: string }
  const displayName = discordUser.global_name ?? discordUser.username

  await db.adminUser.update({
    where: { id: adminUserId },
    data: {
      discordUserId: discordUser.id,
      discordUsername: displayName,
    },
  })

  // Confirmation DM so the staff member can verify the link landed
  // on the right account.
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: discordUser.id }),
      })
      if (dmRes.ok) {
        const dm = await dmRes.json() as { id: string }
        const { sendChannelMessage } = await import('@/lib/discord')
        await sendChannelMessage(dm.id, {
          embeds: [{
            title: 'Vault Discord linked',
            description: "You'll get DMs from the AFF Concierge bot when something in the vault needs your attention — new business submissions, licensing tickets, agent replies, etc.",
            color: 0x4ade80,
            footer: { text: 'All Financial Freedom' },
          }],
        })
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.redirect(`${settingsUrl}?discord=connected&username=${encodeURIComponent(displayName)}`)
}
