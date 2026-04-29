// Resolves who the caller is for an /api/agents/* route.
//
// Two valid identities:
//   1. Real agent session (the agent themselves, signed into /agents)
//   2. Admin / LC session + ?preview=<token> in the URL
//      (vault "view as agent")
//
// Without (2), every action an admin tries from the agent UI in preview
// mode 401s. That was the production "Unauthorized" bug on the Refer
// form. Centralizing this here so every agent route stays consistent.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import { db } from './db'
import { getSetting } from './settings'

export type AgentIdentity =
  | { profileId: string; previewing: boolean }
  | { error: NextResponse }

export async function resolveAgentIdentity(req: NextRequest): Promise<AgentIdentity> {
  const previewToken = new URL(req.url).searchParams.get('preview')
  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        const session = await getServerSession(authOptions)
        const role = (session?.user as { role?: string } | undefined)?.role
        // Only admins / LCs can use a preview token to act on behalf of
        // an agent. Don't accept stale tokens from random callers.
        if (role === 'admin' || role === 'licensing_coordinator') {
          return { profileId: data.agentProfileId, previewing: true }
        }
      }
    }
  }

  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // Validate before hitting the DB. Prisma silently treats
  // `email: undefined` as "no filter" on nested lookups, which can
  // return arbitrary rows. Bail explicitly when the session has no
  // email so callers get a clean 401 instead of mysterious empty data.
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return { error: NextResponse.json({ error: 'Session has no email' }, { status: 401 }) }
  }

  // Case-insensitive lookup so an email stored as "Joanna@email.com"
  // still resolves when the session reports "joanna@email.com" (and
  // vice versa). Postgres string equality is case-sensitive by
  // default which has bitten us in production.
  const u = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!u?.profile?.id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) }
  }
  return { profileId: u.profile.id, previewing: false }
}
