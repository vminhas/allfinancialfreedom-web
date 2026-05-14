import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import type { PolicyType } from '@/generated/prisma/client'
import { notifySubmitted } from '@/lib/new-business-notifications'
import { logSubmissionActivity } from '@/lib/submission-activity'
import { recomputeClimbAchievements } from '@/lib/climb-points'
import { getAutoAssignee } from '@/lib/auto-assign'
import { createNotification } from '@/lib/notify'
import { validatePhone, validateEmail } from '@/lib/contact-validation'

// POST /api/vault/new-business/on-behalf
//
// Lets a licensing coordinator (or admin) log a new business policy
// on behalf of a specific agent — typically Vick the CEO who writes
// policies but doesn't log them himself. Same downstream side-
// effects as the agent-portal POST: admin-channel ping, split-agent
// notify, Climb recompute. Bypasses the phase-gate the agent
// endpoint enforces, since the writing agent isn't the one filling
// out the form.
//
// Audit-logs the submission as CREATED with the LC's admin user id
// as the actor so reporting can distinguish self-logged vs.
// LC-logged policies later.

const VALID_POLICY_TYPES: PolicyType[] = [
  'TERM', 'WHOLE_LIFE', 'IUL', 'ANNUITY', 'DISABILITY', 'LTC', 'OTHER',
]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied
  const adminId = (session!.user as { id?: string }).id
  if (!adminId) return NextResponse.json({ error: 'No user id' }, { status: 401 })

  const body = await req.json() as {
    agentProfileId?: string
    applicationDate?: string
    carrier?: string
    policyType?: PolicyType
    points?: number | string | null
    splitWithAgentId?: string | null
    clientFirstName?: string
    clientLastName?: string
    clientPhone?: string
    clientEmail?: string
    clientBirthday?: string | null
    clientAddressLine1?: string | null
    clientAddressLine2?: string | null
    clientCity?: string | null
    clientState?: string | null
    clientZip?: string | null
  }

  if (!body.agentProfileId) {
    return NextResponse.json({ error: 'agentProfileId required (pick the agent who wrote the policy)' }, { status: 400 })
  }
  if (!body.policyType || !VALID_POLICY_TYPES.includes(body.policyType)) {
    return NextResponse.json({ error: 'Invalid policyType' }, { status: 400 })
  }
  if (!body.applicationDate || !body.carrier || !body.clientFirstName || !body.clientLastName) {
    return NextResponse.json({ error: 'applicationDate, carrier, clientFirstName, clientLastName are required' }, { status: 400 })
  }
  const phoneErr = validatePhone(body.clientPhone)
  if (phoneErr) return NextResponse.json({ error: phoneErr }, { status: 400 })
  const emailErr = validateEmail(body.clientEmail)
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 })

  const agent = await db.agentProfile.findUnique({
    where: { id: body.agentProfileId },
    select: { id: true, firstName: true, lastName: true, agentCode: true },
  })
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // If the submitter is an LC, assign to them directly; otherwise round-robin.
  const submitterRole = (session!.user as { role?: string }).role
  const assignedToId = submitterRole === 'licensing_coordinator'
    ? adminId
    : await getAutoAssignee()

  const submission = await db.newBusinessSubmission.create({
    data: {
      agentProfileId: agent.id,
      applicationDate: new Date(body.applicationDate),
      carrier: body.carrier,
      policyType: body.policyType,
      points: body.points != null && body.points !== '' ? Number(body.points) : null,
      splitWithAgentId: body.splitWithAgentId || null,
      assignedToId,
      illustrationUrls: [],
      clientFirstName: body.clientFirstName,
      clientLastName: body.clientLastName,
      clientPhone: (body.clientPhone ?? '').trim(),
      clientEmail: (body.clientEmail ?? '').trim(),
      clientBirthday: body.clientBirthday ? new Date(body.clientBirthday) : null,
      clientAddressLine1: body.clientAddressLine1 || null,
      clientAddressLine2: body.clientAddressLine2 || null,
      clientCity: body.clientCity || null,
      clientState: body.clientState || null,
      clientZip: body.clientZip || null,
    },
  })

  // Pull the split partner so the announcement can shout them out.
  const splitPartner = submission.splitWithAgentId
    ? await db.agentProfile.findUnique({
        where: { id: submission.splitWithAgentId },
        select: { firstName: true, lastName: true, agentCode: true },
      }).catch(() => null)
    : null

  // LC + admin channel pings — same flow as agent-side POST so the
  // submission shows up alongside agent-logged ones.
  notifySubmitted({
    agentName: `${agent.firstName} ${agent.lastName}`,
    policyType: body.policyType,
    carrier: submission.carrier,
    clientName: `${submission.clientFirstName} ${submission.clientLastName}`,
    points: submission.points,
    splitWith: splitPartner ?? null,
  }).catch(() => {})

  // LC activity feed: who logged this on behalf of whom. session is
  // guaranteed non-null here — requireRole above 401s otherwise —
  // but TS needs the assertion to narrow.
  const actorName = (session!.user as { name?: string } | undefined)?.name ?? 'LC'
  const actorRole = (session!.user as { role?: 'admin' | 'licensing_coordinator' } | undefined)?.role ?? 'admin'
  const { logOnBehalfSubmission } = await import('@/lib/lc-activity')
  logOnBehalfSubmission({
    writer: { firstName: agent.firstName, lastName: agent.lastName, agentCode: agent.agentCode },
    carrier: submission.carrier,
    policyType: body.policyType,
    clientName: `${submission.clientFirstName} ${submission.clientLastName}`,
    points: submission.points,
    actor: { id: adminId, name: actorName, role: actorRole },
  }).catch(() => {})

  // Audit log: writer is the agent the policy is FOR, not the LC
  // who entered it (so leaderboard math + Climb credit go to the
  // right person). Meta records the LC's admin id for later
  // 'who entered this' reporting.
  // actorAdminId records the LC who entered it; the activity row still
  // attributes the policy itself to the writing agent via the
  // submission's agentProfileId. enteredOnBehalf flag in meta makes
  // 'who entered this' queries trivial.
  logSubmissionActivity({
    submissionId: submission.id,
    kind: 'CREATED',
    actorAdminId: adminId,
    meta: {
      carrier: submission.carrier,
      policyType: body.policyType,
      writerAgentProfileId: agent.id,
      enteredOnBehalf: true,
    },
  })
  if (submission.splitWithAgentId) {
    const split = await db.agentProfile.findUnique({
      where: { id: submission.splitWithAgentId },
      select: { firstName: true, lastName: true, agentCode: true },
    }).catch(() => null)
    logSubmissionActivity({
      submissionId: submission.id,
      kind: 'SPLIT_ADDED',
      actorAdminId: adminId,
      meta: split ? { name: `${split.firstName} ${split.lastName}`, agentCode: split.agentCode } : {},
    })
  }

  // Notify the split partner (if any) the same way the agent
  // endpoint does. They get a bell + Discord DM.
  if (submission.splitWithAgentId) {
    const writerName = `${agent.firstName} ${agent.lastName}`.trim()
    const clientName = `${submission.clientFirstName} ${submission.clientLastName}`
    createNotification({
      recipientAgentProfileId: submission.splitWithAgentId,
      kind: 'policy.split_added',
      subjectType: 'new_business',
      subjectId: submission.id,
      title: `📎 Added as split agent on ${clientName}'s policy`,
      body: `${writerName} added you as a split agent on a ${submission.carrier} ${body.policyType.toLowerCase()} policy. You can view and comment on it from New Business.`,
      linkUrl: `/agents?tab=new-business&submission=${submission.id}`,
      color: 0xC9A96E,
      discord: {
        title: '📎 You were added as a split agent',
        description: `**${writerName}** added you to **${clientName}**'s policy. View + comment from your New Business tab.`,
        color: 0xC9A96E,
        fields: [
          { name: 'Carrier',     value: submission.carrier,            inline: true },
          { name: 'Policy type', value: body.policyType.toString(),    inline: true },
          { name: 'Client',      value: clientName,                    inline: true },
        ],
      },
    }).catch(err => console.warn('[new-business on-behalf] split notify failed:', err))
  }

  // Climb recompute for both writer + split partner.
  recomputeClimbAchievements(agent.id).catch(err =>
    console.warn('[new-business on-behalf] climb recompute (writer) failed:', err)
  )
  if (submission.splitWithAgentId) {
    recomputeClimbAchievements(submission.splitWithAgentId).catch(err =>
      console.warn('[new-business on-behalf] climb recompute (split) failed:', err)
    )
  }

  return NextResponse.json({ submission })
}
