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

  const referrals = await db.agentReferral.findMany({
    where: { referringAgentId: profileId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ referrals })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json() as {
    firstName: string
    lastName: string
    email: string
    phone?: string
    state?: string
    notes?: string
  }

  if (!body.firstName || !body.lastName || !body.email) {
    return NextResponse.json({ error: 'firstName, lastName, email required' }, { status: 400 })
  }

  const existing = await db.agentReferral.findFirst({
    where: { email: body.email.toLowerCase(), status: { not: 'REJECTED' } },
  })
  if (existing) {
    return NextResponse.json({ error: 'This person has already been referred' }, { status: 409 })
  }

  const existingAgent = await db.agentUser.findUnique({
    where: { email: body.email.toLowerCase() },
  })
  if (existingAgent) {
    return NextResponse.json({ error: 'This person is already an agent' }, { status: 409 })
  }

  const referral = await db.agentReferral.create({
    data: {
      referringAgentId: profileId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email.toLowerCase(),
      phone: body.phone,
      state: body.state,
      notes: body.notes,
    },
  })

  return NextResponse.json(referral)
}
