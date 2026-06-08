import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { approveReferral } from '@/lib/referral-approval'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'PENDING'
  // Pagination: default page=1, limit=25. Tighten the page size so
  // the Referrals tab doesn't scroll forever once historical referrals
  // accumulate (the original "all" view returned every row ever).
  // Search filter (?q=) hits across recruit name, email, and the
  // referring agent's name/code so the LC can find anyone fast.
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))
  const q = (searchParams.get('q') ?? '').trim()

  const baseWhere = status === 'ALL' ? {} : { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' }
  const where = q.length >= 2
    ? {
        ...baseWhere,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' as const } },
          { lastName:  { contains: q, mode: 'insensitive' as const } },
          { email:     { contains: q, mode: 'insensitive' as const } },
          { referringAgent: { firstName: { contains: q, mode: 'insensitive' as const } } },
          { referringAgent: { lastName:  { contains: q, mode: 'insensitive' as const } } },
          { referringAgent: { agentCode: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : baseWhere

  const [referrals, total] = await Promise.all([
    db.agentReferral.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        referringAgent: {
          select: { id: true, firstName: true, lastName: true, agentCode: true, referralsBlockedAt: true },
        },
      },
    }),
    db.agentReferral.count({ where }),
  ])

  return NextResponse.json({ referrals, page, limit, total })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    action: 'approve' | 'reject'
    adminNotes?: string
    cft?: string
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 })
  }

  const referral = await db.agentReferral.findUnique({ where: { id: body.id } })
  if (!referral) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (referral.status !== 'PENDING') {
    return NextResponse.json({ error: 'Already processed' }, { status: 400 })
  }

  if (body.action === 'reject') {
    await db.agentReferral.update({
      where: { id: body.id },
      data: {
        status: 'REJECTED',
        adminNotes: body.adminNotes,
        approvedAt: new Date(),
        approvedById: (session!.user as { id?: string }).id ?? session!.user!.email,
      },
    })
    return NextResponse.json({ ok: true, status: 'REJECTED' })
  }

  // Approve via the shared helper so the Discord button and this route stay
  // in sync. Handler creates the AgentUser+AgentProfile, marks the referral
  // APPROVED, and best-effort fires the welcome email.
  const approvedById = (session!.user as { id?: string }).id ?? session!.user!.email!
  const approvedByLabel = (session!.user as { name?: string }).name ?? session!.user!.email!
  const result = await approveReferral({
    referralId: body.id,
    approvedById,
    approvedByLabel,
    cft: body.cft,
  })

  // adminNotes is a vault-only thing; the Discord button doesn't collect it.
  // Apply it after the helper returns so the field survives.
  if (result.ok && body.adminNotes) {
    await db.agentReferral.update({
      where: { id: body.id },
      data: { adminNotes: body.adminNotes },
    })
  }

  if (!result.ok) {
    const status =
      result.status === 'CONFLICT' ? 409 :
      result.status === 'INVALID' ? 404 : 500
    return NextResponse.json({ error: result.error ?? 'Approval failed' }, { status })
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    agentCode: result.agentCode,
    profileId: result.profileId,
    emailSent: result.emailSent,
    linkedExisting: result.linkedExisting ?? false,
  })
}

// DELETE /api/vault/referrals
//
// Bulk-removes referrals for spam cleanup. Two shapes:
//
//   ?referringAgentId=...&status=PENDING   nuke every PENDING referral
//                                          from this agent (default
//                                          status PENDING; pass ALL to
//                                          purge across statuses).
//   { ids: [...] } in the body              explicit list of referral
//                                          IDs to delete.
//
// Admin-only (not LC) since this is destructive and only used for
// abuse cleanup. APPROVED referrals are never bulk-deleted by the
// status path — only PENDING or REJECTED. To remove an APPROVED one
// (and its created agent), do it by explicit id.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const referringAgentId = searchParams.get('referringAgentId')
  const status = searchParams.get('status') ?? 'PENDING'

  let body: { ids?: string[] } = {}
  try { body = await req.json() } catch { /* body is optional */ }

  if (!referringAgentId && !body.ids?.length) {
    return NextResponse.json(
      { error: 'Either referringAgentId query param OR ids[] in body required' },
      { status: 400 },
    )
  }

  let deleted = 0
  if (body.ids?.length) {
    const r = await db.agentReferral.deleteMany({
      where: { id: { in: body.ids } },
    })
    deleted = r.count
  } else if (referringAgentId) {
    const where = status === 'ALL'
      ? { referringAgentId, status: { in: ['PENDING', 'REJECTED'] as ('PENDING' | 'REJECTED')[] } }
      : { referringAgentId, status: status as 'PENDING' | 'REJECTED' }
    const r = await db.agentReferral.deleteMany({ where })
    deleted = r.count
  }

  return NextResponse.json({ ok: true, deleted })
}
