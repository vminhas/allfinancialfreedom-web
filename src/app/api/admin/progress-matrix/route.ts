import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/progress-matrix
//
// Returns the data needed to render the agent × checklist progression
// matrix at /vault/progress: every active agent on one axis, every
// PhaseItemDefinition on the other, and a sparse map of completions.
// The page renders the whole thing client-side from this single payload
// so we don't ship N+1 round trips for what's effectively one screen.
export async function GET() {
  const session = await getServerSession(authOptions)
  // LC sees this page too (read access to the same matrix, plus write
  // access to their single column via the tevah-toggle route). Admin
  // keeps full edit rights elsewhere.
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const [agents, items, completions] = await Promise.all([
    db.agentProfile.findMany({
      // Hide test accounts from the roster-facing matrix. They still
      // exist and can log in; they're just excluded from any view that
      // implies "this is the team."
      where: { status: 'ACTIVE', isTest: false },
      select: {
        id: true, agentCode: true, firstName: true, lastName: true,
        phase: true, avatarUrl: true, state: true,
        icaDate: true, badges: true,
        // recruiterId (recruiter's agentCode) and cft (trainer name) power the
        // recruiter/trainer team filter on the cohorts view.
        recruiterId: true, cft: true,
        // Let the cohorts view exclude leadership + referral partners, who
        // aren't in the onboarding funnel, from "the team."
        isLeadership: true, isReferralPartner: true,
        // phaseStartedAt powers the time-aware "At Risk" calculation.
        // Without it the only signal would be raw current-phase
        // completion %, which mislabels anyone who just entered a new
        // phase (low % is normal at the start, not a problem).
        phaseStartedAt: true,
        // examDate drives the LC view's "Schedule Exam" column — that
        // column doesn't have a phase-item bit of its own; it mirrors
        // the date the LC scheduled on the licensing record.
        examDate: true,
        // LC-owned milestone. Distinct from any phase-item completion.
        subscribedToTevahAt: true,
        // lastLoginAt lives on AgentUser (auth row), not the profile.
        // Pull it via the relation so the page can sort by recent
        // activity without a second query. Email comes along too so
        // the per-column drawer can fire reminder emails to the
        // "haven't completed this yet" subset without a second fetch.
        agentUser: { select: { lastLoginAt: true, email: true } },
      },
      orderBy: [{ phase: 'desc' }, { agentCode: 'asc' }],
    }),
    db.phaseItemDefinition.findMany({
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      select: { phase: true, itemKey: true, label: true, groupKey: true, adminOnly: true },
    }),
    db.phaseItem.findMany({
      where: { completed: true },
      select: { agentProfileId: true, itemKey: true, completedAt: true },
    }),
  ])

  // Sparse map keyed `<agentProfileId>:<itemKey>` so the page can do an
  // O(1) lookup per cell when rendering. ISO timestamp value lets the
  // tooltip show when each box was checked.
  const completedAt: Record<string, string> = {}
  for (const c of completions) {
    completedAt[`${c.agentProfileId}:${c.itemKey}`] = c.completedAt?.toISOString() ?? ''
  }

  // Flatten lastLoginAt onto the agent shape the page expects. Keeps
  // the client interface flat instead of forcing it to deal with the
  // relation object.
  const flatAgents = agents.map(a => ({
    id: a.id,
    agentCode: a.agentCode,
    firstName: a.firstName,
    lastName: a.lastName,
    phase: a.phase,
    avatarUrl: a.avatarUrl,
    state: a.state,
    icaDate: a.icaDate?.toISOString() ?? null,
    phaseStartedAt: a.phaseStartedAt?.toISOString() ?? null,
    examDate: a.examDate?.toISOString() ?? null,
    subscribedToTevahAt: a.subscribedToTevahAt?.toISOString() ?? null,
    lastLoginAt: a.agentUser?.lastLoginAt?.toISOString() ?? null,
    email: a.agentUser?.email ?? null,
    badges: a.badges ?? [],
    recruiterId: a.recruiterId ?? null,
    cft: a.cft ?? null,
    isLeadership: a.isLeadership ?? false,
    isReferralPartner: a.isReferralPartner ?? false,
  }))

  return NextResponse.json({ agents: flatAgents, items, completedAt })
}
