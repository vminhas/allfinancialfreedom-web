import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function getProfileId(email: string) {
  const u = await db.agentUser.findUnique({
    where: { email },
    include: { profile: { select: { id: true } } },
  })
  return u?.profile?.id ?? null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const policies = await db.policyEntry.findMany({
    where: { agentProfileId: profileId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(policies)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json() as {
    clientName: string
    carrier: string
    product: string
    policyNumber?: string
    splitAgentName?: string
    dateSubmitted?: string
    targetPremium?: number
    targetPoints?: number
    commissionPayout?: number
    notes?: string
  }

  if (!body.clientName || !body.carrier || !body.product) {
    return NextResponse.json({ error: 'clientName, carrier, product required' }, { status: 400 })
  }

  const policy = await db.policyEntry.create({
    data: {
      agentProfileId: profileId,
      clientName: body.clientName,
      carrier: body.carrier,
      product: body.product,
      policyNumber: body.policyNumber,
      splitAgentName: body.splitAgentName,
      dateSubmitted: body.dateSubmitted ? new Date(body.dateSubmitted) : null,
      targetPremium: body.targetPremium,
      targetPoints: body.targetPoints,
      commissionPayout: body.commissionPayout,
      notes: body.notes,
    },
  })

  return NextResponse.json(policy)
}
