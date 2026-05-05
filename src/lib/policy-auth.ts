// Single source of truth for who can see / comment on / edit a
// PolicyEntry. The split-agent collaboration model has three access
// tiers:
//
//   * Writer (PolicyEntry.agentProfileId)  — full control: edit
//     fields, add/remove split agent, post + edit own comments.
//   * Split agent (PolicyEntry.splitAgentId) — view + post comments
//     (incl. on their own comments). Cannot edit policy fields.
//   * Admin / Licensing Coordinator — view + comment for support
//     purposes. They aren't tied to specific policies but are
//     trusted across the org.
//
// Everyone else: no access.
//
// This module is the only place that resolves the tier for a given
// (agentProfileId, policyId) pair. API handlers use these helpers
// instead of duplicating the OR-clauses across endpoints.

import { db } from '@/lib/db'

export type PolicyRole = 'writer' | 'split' | 'admin' | 'none'

interface ResolveArgs {
  policyEntryId: string
  // Either an authenticated agent's profileId or a session role for
  // admin/LC users. Pass profileId when the caller is an agent;
  // pass role when the caller is from the vault side.
  agentProfileId?: string
  role?: 'admin' | 'licensing_coordinator' | 'agent' | string
}

export async function resolvePolicyRole(args: ResolveArgs): Promise<PolicyRole> {
  // Admin / LC always have access. We don't tie them to specific
  // policies — they're trusted across the org for support.
  if (args.role === 'admin' || args.role === 'licensing_coordinator') return 'admin'

  if (!args.agentProfileId) return 'none'

  const policy = await db.policyEntry.findUnique({
    where: { id: args.policyEntryId },
    select: { agentProfileId: true, splitAgentId: true },
  })
  if (!policy) return 'none'

  if (policy.agentProfileId === args.agentProfileId) return 'writer'
  if (policy.splitAgentId === args.agentProfileId) return 'split'
  return 'none'
}

export function canViewPolicy(role: PolicyRole): boolean {
  return role !== 'none'
}

export function canCommentOnPolicy(role: PolicyRole): boolean {
  return role !== 'none'
}

// Field edits (carrier, premium, dates, status, removing the split
// agent) are writer-only. Admins can also edit for support reasons.
export function canEditPolicy(role: PolicyRole): boolean {
  return role === 'writer' || role === 'admin'
}

// Convenience: build the Prisma where-clause that returns every
// policy a given agent can SEE (writer's own + ones they're split on).
// Admin callers should use a different code path that doesn't filter
// at all.
export function policyVisibilityWhere(agentProfileId: string) {
  return {
    OR: [
      { agentProfileId },
      { splitAgentId: agentProfileId },
    ],
  }
}
