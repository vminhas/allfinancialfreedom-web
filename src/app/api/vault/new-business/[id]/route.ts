import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { notifyIssued, notifyDeclined } from '@/lib/new-business-notifications'
import { logSubmissionActivity } from '@/lib/submission-activity'
import { validatePhone, validateEmail } from '@/lib/contact-validation'
import type { NewBusinessStatus, PolicyType } from '@/generated/prisma/client'

const VALID_STATUSES: NewBusinessStatus[] = ['PENDING', 'PENDING_CARRIER', 'ISSUED', 'CONDITIONALLY_ISSUED', 'DECLINED', 'LAPSED', 'NOT_TAKEN', 'HOLD']
const VALID_POLICY_TYPES: PolicyType[] = ['TERM', 'WHOLE_LIFE', 'IUL', 'ANNUITY', 'DISABILITY', 'LTC', 'OTHER']

const STAFF_EDITABLE = [
  'status', 'issuedDate', 'policyNumber', 'declinedReason', 'assignedToId',
  // Coordinators may also clean up agent-entered fields if the agent typoed something
  'applicationDate', 'carrier', 'policyType', 'points',
  'clientFirstName', 'clientLastName', 'clientPhone', 'clientEmail', 'clientBirthday',
  'clientAddressLine1', 'clientAddressLine2', 'clientCity', 'clientState', 'clientZip',
] as const

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied
  const { id } = await ctx.params

  const submission = await db.newBusinessSubmission.findUnique({
    where: { id },
    include: {
      agentProfile: { select: { id: true, firstName: true, lastName: true, agentCode: true, avatarUrl: true, discordUserId: true } },
      splitWithAgent: { select: { id: true, firstName: true, lastName: true, agentCode: true } },
      assignedTo: { select: { id: true, name: true } },
      notes: {
        orderBy: { createdAt: 'asc' },
        include: {
          authorAgent: { select: { id: true, firstName: true, lastName: true } },
          authorAdmin: { select: { name: true } },
        },
      },
    },
  })
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ submission })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied
  const { id } = await ctx.params

  const existing = await db.newBusinessSubmission.findUnique({
    where: { id },
    include: {
      agentProfile: { select: { firstName: true, lastName: true, preferredName: true, agentCode: true, avatarUrl: true, discordUserId: true } },
      // splitWithAgent loaded so the POLICY ISSUED card can shout
      // out both writers when a split was set on this submission.
      splitWithAgent: { select: { firstName: true, lastName: true, agentCode: true, discordUserId: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>

  if ('clientPhone' in body) {
    const err = validatePhone(body.clientPhone)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }
  if ('clientEmail' in body) {
    const err = validateEmail(body.clientEmail)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  for (const f of STAFF_EDITABLE) {
    if (!(f in body)) continue
    const v = body[f]
    if (f === 'status') {
      if (!VALID_STATUSES.includes(v as NewBusinessStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      data[f] = v
    } else if (f === 'policyType') {
      if (!VALID_POLICY_TYPES.includes(v as PolicyType)) {
        return NextResponse.json({ error: 'Invalid policyType' }, { status: 400 })
      }
      data[f] = v
    } else if (f === 'applicationDate' || f === 'issuedDate' || f === 'clientBirthday') {
      data[f] = v ? new Date(v as string) : null
    } else if (f === 'points') {
      data[f] = v == null || v === '' ? null : Number(v)
    } else if (f === 'clientPhone' || f === 'clientEmail') {
      data[f] = (v as string).trim()
    } else {
      data[f] = v === '' ? null : v
    }
  }

  // Auto-stamp issuedDate when status flips to ISSUED if not already provided
  if (data.status === 'ISSUED' && !data.issuedDate && !existing.issuedDate) {
    data.issuedDate = new Date()
  }

  const updated = await db.newBusinessSubmission.update({ where: { id }, data })

  const statusChanged = data.status && data.status !== existing.status
  const agentName = `${existing.agentProfile.firstName} ${existing.agentProfile.lastName}`
  const clientName = `${existing.clientFirstName} ${existing.clientLastName}`

  // Audit-log: status changes get their own activity row so the
  // drawer's Activity tab reads as a clean lifecycle ("Pending →
  // Issued by Vick on 5/6"). Split add/remove is handled below in
  // case the LC ever fixes a typoed split agent (not yet exposed
  // in the UI but the data path is already covered for future).
  const adminId = (session?.user as { id?: string } | undefined)?.id
  if (statusChanged) {
    logSubmissionActivity({
      submissionId: id,
      kind: 'STATUS_CHANGED',
      actorAdminId: adminId ?? null,
      meta: { from: existing.status, to: data.status },
    })
    // LC activity feed mirror.
    const actorName = (session?.user as { name?: string } | undefined)?.name ?? 'LC'
    const actorRole = (session?.user as { role?: 'admin' | 'licensing_coordinator' } | undefined)?.role ?? 'admin'
    const { logNewBusinessStatusChange } = await import('@/lib/lc-activity')
    logNewBusinessStatusChange({
      submissionId: id,
      writer: {
        firstName: existing.agentProfile.firstName,
        lastName: existing.agentProfile.lastName,
        agentCode: existing.agentProfile.agentCode,
      },
      carrier: existing.carrier,
      policyType: existing.policyType,
      oldStatus: existing.status,
      newStatus: data.status as string,
      actor: { id: adminId ?? '', name: actorName, role: actorRole },
    }).catch(err => console.warn('[new-business PATCH] lc-activity failed:', err))
  }

  if (statusChanged && data.status === 'ISSUED') {
    notifyIssued({
      agentDiscordUserId: existing.agentProfile.discordUserId,
      agentName,
      agentFirstName: existing.agentProfile.firstName,
      agentLastName: existing.agentProfile.lastName,
      agentPreferredName: existing.agentProfile.preferredName,
      agentCode: existing.agentProfile.agentCode,
      agentAvatarUrl: existing.agentProfile.avatarUrl,
      clientName,
      carrier: existing.carrier,
      policyType: existing.policyType,
      splitWith: existing.splitWithAgent ?? null,
    }).catch(() => {})
  } else if (statusChanged && data.status === 'DECLINED') {
    notifyDeclined({
      agentDiscordUserId: existing.agentProfile.discordUserId,
      clientName,
      carrier: existing.carrier,
      reason: (data.declinedReason as string | null) ?? existing.declinedReason,
    }).catch(() => {})
  }

  return NextResponse.json({ submission: updated })
}

// Hard-delete a submission. Admin + LC only. Cascades to notes,
// illustrations, renewal reminders, and split-agent rows via the FK
// onDelete: Cascade declared in schema.prisma, so there are no
// orphan rows after the call. Used when an agent accidentally
// double-submits a policy and the LC needs to clean it up.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const existing = await db.newBusinessSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      clientFirstName: true,
      clientLastName: true,
      carrier: true,
      policyType: true,
      agentProfile: { select: { agentCode: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.newBusinessSubmission.delete({ where: { id } })

  return NextResponse.json({
    ok: true,
    deleted: {
      id: existing.id,
      client: `${existing.clientFirstName} ${existing.clientLastName}`.trim(),
      carrier: existing.carrier,
      policyType: existing.policyType,
      agentCode: existing.agentProfile.agentCode,
    },
  })
}
