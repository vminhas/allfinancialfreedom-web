// /vault/audit
//
// Browser-friendly view of the SignInAttempt log. Today this only logs
// REJECTED Google sign-ins (the audit-trail use case the team asked
// for: "did anyone try to get in who shouldn't have?"). Successful
// sign-ins live on AdminUser/AgentUser.lastLoginAt and aren't
// duplicated here to keep the page focused on actionable noise.
//
// Admin-only. LC role does not see this.

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const OUTCOME_LABEL: Record<string, { label: string; color: string }> = {
  rejected_unknown_email:    { label: 'Unknown email',       color: '#F59E0B' },
  rejected_inactive_agent:   { label: 'Inactive agent',      color: '#9B6DFF' },
}

export default async function AuditPage() {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) redirect('/vault')

  const attempts = await db.signInAttempt.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  // Group by email to show "X attempts from Y address" at a glance.
  const byEmail = new Map<string, typeof attempts>()
  for (const a of attempts) {
    const list = byEmail.get(a.email) ?? []
    list.push(a)
    byEmail.set(a.email, list)
  }

  return (
    <div style={{ maxWidth: 960, padding: '0 8px' }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>
          Auth audit
        </p>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 300, margin: '4px 0 6px' }}>
          Rejected sign-in attempts
        </h1>
        <p style={{ color: '#9BB0C4', fontSize: 13, margin: 0, lineHeight: 1.55 }}>
          Every Google sign-in that didn&apos;t match an authorized AdminUser or active AgentUser
          is logged here (and pinged to the admin Discord channel in real time).
          Successful sign-ins are tracked separately on each user&apos;s last-login timestamp.
        </p>
      </header>

      {attempts.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          background: 'rgba(74,222,128,0.04)',
          border: '1px dashed rgba(74,222,128,0.25)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 14, color: '#4ade80', marginBottom: 4 }}>No rejected attempts on record</div>
          <div style={{ fontSize: 12, color: '#6B8299' }}>
            Nobody outside the AFF roster has tried to sign in. We&apos;ll log it here the moment they do.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from(byEmail.entries()).map(([email, list]) => {
            const newest = list[0]
            const outcome = OUTCOME_LABEL[newest.outcome] ?? { label: newest.outcome, color: '#9BB0C4' }
            return (
              <div key={email} style={{
                background: '#142D48',
                border: '1px solid rgba(201,169,110,0.12)',
                borderRadius: 8,
                padding: '14px 18px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{email}</div>
                    <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                      {list.length} attempt{list.length === 1 ? '' : 's'}
                      {' · '}
                      most recent {new Date(newest.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    padding: '4px 10px', borderRadius: 999,
                    background: `${outcome.color}15`,
                    border: `1px solid ${outcome.color}40`,
                    color: outcome.color,
                    flexShrink: 0,
                  }}>
                    {outcome.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
