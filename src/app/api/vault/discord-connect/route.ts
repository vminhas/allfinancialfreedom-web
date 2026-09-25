import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { oauthCookieDomain } from '@/lib/oauth-cookie'

// GET /api/vault/discord-connect
//
// Kicks off Discord OAuth for staff (admins + licensing coordinators)
// so the bot can DM them on events that need their attention. Stores
// a CSRF state token in a short-lived cookie; the callback validates.
// Mirrors the agent-side flow at /api/agents/discord-connect.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const clientId = process.env.DISCORD_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Discord OAuth not configured' }, { status: 503 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const redirectUri = `${baseUrl}/api/vault/discord-callback`

  const state = randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  // Scope to the parent domain so the cookie survives the www/apex split (see
  // oauthCookieDomain), and give the round trip 30 minutes instead of 5: staff
  // routinely detour through a Discord login, 2FA prompt, or app switch, and a
  // 5-minute window expired mid-flow and failed the CSRF check as invalid_state.
  cookieStore.set('vault_discord_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1800,
    secure: process.env.NODE_ENV === 'production',
    ...(oauthCookieDomain(req.headers.get('host')) ? { domain: oauthCookieDomain(req.headers.get('host')) } : {}),
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  })

  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`)
}
