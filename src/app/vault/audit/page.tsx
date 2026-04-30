// /vault/audit
//
// Two views in one page:
//   1. Sign-in attempts: rejected Google sign-ins, grouped by email.
//      Same data as before — answers "did anyone try to get in who
//      shouldn't have?"
//   2. Account activity: recent agent + admin account creations and
//      activations, sorted by most recent. Answers "who was added to
//      the system, and have they activated yet?"
//
// Successful sign-ins live on AdminUser/AgentUser.lastLoginAt and
// aren't duplicated here. Real-time visibility for both views also
// goes to the admin Discord channel.
//
// Admin-only. LC role does not see this page.

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/permissions'
import AuditTabs from './AuditTabs'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) redirect('/vault')

  const [attempts, recentAgents, recentAdmins] = await Promise.all([
    db.signInAttempt.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    // Agent accounts created in the last 90 days. Includes activation
    // signal: passwordHash !== null means they've accepted the invite.
    db.agentUser.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, createdAt: true, lastLoginAt: true,
        passwordHash: true,
        profile: { select: { firstName: true, lastName: true, agentCode: true, recruiterId: true } },
      },
      take: 100,
    }),
    db.adminUser.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
      take: 100,
    }),
  ])

  // Project to plain JSON so the client component can take it as-is.
  // Strip passwordHash to a boolean indicator.
  const accountActivity = [
    ...recentAgents.map(a => ({
      kind: 'agent' as const,
      id: a.id,
      email: a.email,
      name: a.profile ? `${a.profile.firstName} ${a.profile.lastName}` : a.email,
      agentCode: a.profile?.agentCode ?? null,
      role: 'agent',
      createdAt: a.createdAt.toISOString(),
      activated: a.passwordHash != null,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    })),
    ...recentAdmins.map(a => ({
      kind: 'admin' as const,
      id: a.id,
      email: a.email,
      name: a.name,
      agentCode: null,
      role: a.role === 'LICENSING_COORDINATOR' ? 'licensing_coordinator' : 'admin',
      createdAt: a.createdAt.toISOString(),
      activated: true, // admin accounts are usable immediately on create
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const attemptsJson = attempts.map(a => ({
    id: a.id,
    email: a.email,
    provider: a.provider,
    outcome: a.outcome,
    createdAt: a.createdAt.toISOString(),
  }))

  return (
    <div style={{ maxWidth: 960, padding: '0 8px' }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>
          Auth audit
        </p>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 300, margin: '4px 0 6px' }}>
          Sign-in attempts &amp; account activity
        </h1>
        <p style={{ color: '#9BB0C4', fontSize: 13, margin: 0, lineHeight: 1.55 }}>
          Rejected Google sign-ins and recent account creations are logged here.
          Both also ping the admin Discord channel in real time.
        </p>
      </header>

      <AuditTabs attempts={attemptsJson} accountActivity={accountActivity} />
    </div>
  )
}
