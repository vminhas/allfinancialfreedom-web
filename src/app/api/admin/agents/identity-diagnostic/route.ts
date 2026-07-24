import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { findAgentUserByEmail } from '@/lib/agent-identity'

// GET /api/admin/agents/identity-diagnostic?q=<name | agentCode | email>
//
// READ-ONLY. Surfaces split-identity problems: when an agent's login (email ->
// AgentUser -> profile) and their agentCode -> profile resolve to DIFFERENT
// AgentProfile rows, their own CRM view (which keys off login) and their
// upline's downline view (which keys off agentCode) disagree — e.g. contacts
// that show for the recruiter but not the agent. Mutates nothing.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ error: 'q required (name, agentCode, or email)' }, { status: 400 })
  const isEmail = q.includes('@')

  const profileSelect = {
    id: true, agentCode: true, firstName: true, lastName: true, phase: true,
    status: true, isTest: true, recruiterId: true, agentUserId: true, createdAt: true,
    agentUser: { select: { id: true, email: true, lastLoginAt: true } },
  } as const

  const byNameCode = await db.agentProfile.findMany({
    where: {
      OR: [
        { agentCode: { equals: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: profileSelect,
    take: 25,
  })

  // Also pull profiles whose linked AgentUser email matches (login side).
  const byEmailUsers = await db.agentUser.findMany({
    where: { email: { contains: q, mode: 'insensitive' } },
    select: { id: true, email: true, profile: { select: profileSelect } },
    take: 15,
  })

  const profMap = new Map<string, typeof byNameCode[number]>()
  for (const p of byNameCode) profMap.set(p.id, p)
  for (const u of byEmailUsers) if (u.profile) profMap.set(u.profile.id, u.profile)

  const enriched = await Promise.all([...profMap.values()].map(async p => {
    const [contacts, downline] = await Promise.all([
      db.businessPartner.count({ where: { agentProfileId: p.id } }),
      p.agentCode ? db.agentProfile.count({ where: { recruiterId: p.agentCode } }) : Promise.resolve(0),
    ])
    return {
      id: p.id, agentCode: p.agentCode, firstName: p.firstName, lastName: p.lastName,
      phase: p.phase, status: p.status, isTest: p.isTest, recruiterId: p.recruiterId,
      loginEmail: p.agentUser?.email ?? null,
      lastLoginAt: p.agentUser?.lastLoginAt?.toISOString() ?? null,
      hasLogin: !!p.agentUserId,
      contacts, downline,
      createdAt: p.createdAt?.toISOString() ?? null,
    }
  }))
  enriched.sort((a, b) => b.contacts - a.contacts)

  // Which profile does the login email actually resolve to (the exact path
  // resolveAgentIdentity uses for the agent's own CRM)?
  let loginResolvesToProfileId: string | null = null
  if (isEmail) {
    const u = await findAgentUserByEmail(q)
    loginResolvesToProfileId = u?.profile?.id ?? null
  }

  const realProfiles = enriched.filter(p => !p.isTest)
  const withContacts = realProfiles.filter(p => p.contacts > 0)
  // Split signals: more than one real profile for the person, OR the login
  // resolves to a profile that isn't the one holding the contacts.
  const contactProfile = withContacts[0] ?? null
  const loginMismatch = !!(loginResolvesToProfileId && contactProfile && loginResolvesToProfileId !== contactProfile.id)
  const split = realProfiles.length > 1 || loginMismatch

  let recommendation: string | null = null
  if (split && contactProfile) {
    recommendation = loginResolvesToProfileId && loginResolvesToProfileId !== contactProfile.id
      ? `Her login resolves to a different profile than the one holding her ${contactProfile.contacts} contacts (${contactProfile.agentCode}). Reconcile by making the login resolve to ${contactProfile.agentCode} (the profile with her agentCode + contacts + downline) and retiring the duplicate.`
      : `Multiple profiles found for this person. The one with the agentCode + ${contactProfile.contacts} contacts (${contactProfile.agentCode}) is canonical; the others look like duplicates to retire, after confirming no login/data lives only on them.`
  }

  return NextResponse.json({
    q, isEmail, loginResolvesToProfileId,
    split, loginMismatch, recommendation,
    canonicalProfileId: contactProfile?.id ?? null,
    profiles: enriched,
  })
}
