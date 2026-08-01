import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'

// GET /api/agents/discord-connect
// Redirects the agent to Discord OAuth. Stores a CSRF state token in a
// cookie. We request `guilds.join` (alongside `identify`) so the
// callback can add the agent straight into the AFF server, not just
// read their account.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = process.env.DISCORD_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Discord OAuth not configured' }, { status: 503 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const redirectUri = `${baseUrl}/api/agents/discord-callback`

  // CSRF state: random token stored in a short-lived cookie
  const state = randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('discord_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // 30 minutes. The old 5-minute window was too tight: agents routinely
    // detour mid-flow (checking a Discord verification email, switching
    // apps), and an expired cookie makes the callback fail CSRF as
    // `invalid_state` and show the generic "something went wrong" error.
    maxAge: 1800,
    secure: process.env.NODE_ENV === 'production',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.join',
    state,
  })

  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`)
}
