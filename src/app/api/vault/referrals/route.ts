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

  const referrals = await db.agentReferral.findMany({
    where: status === 'ALL' ? {} : { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' },
    orderBy: { createdAt: 'desc' },
    include: {
      referringAgent: {
        select: { firstName: true, lastName: true, agentCode: true },
      },
    },
  })

  return NextResponse.json({ referrals })
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
    status: 'APPROVED',
    agentCode: result.agentCode,
    profileId: result.profileId,
    emailSent: result.emailSent,
  })
}
