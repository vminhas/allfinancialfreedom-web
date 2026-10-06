import type { NewBusinessStatus } from '@/generated/prisma/client'

// PAID is strictly downstream of ISSUED: the policy issued AND the first
// premium cleared. Every place that used to ask "is this policy on the
// books?" with `status === 'ISSUED'` has to accept PAID too, otherwise
// marking a policy Paid silently wipes the agent's leaderboard credit,
// their Climb points, the renewal schedule and the client reminders.
//
// Use ISSUED_STATUSES in Prisma `where` clauses (`status: { in: ... }`)
// and isIssued() for in-memory checks.
export const ISSUED_STATUSES: NewBusinessStatus[] = ['ISSUED', 'PAID']

export function isIssued(status: NewBusinessStatus | string): boolean {
  return status === 'ISSUED' || status === 'PAID'
}
