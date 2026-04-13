import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { agentAuthOptions } from '@/lib/agent-auth'
import { db } from '@/lib/db'

async function getProfileId(email: string) {
  const u = await db.agentUser.findUnique({
    where: { email },
    include: { profile: { select: { id: true } } },
  })
  return u?.profile?.id ?? null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(agentAuthOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50
  const skip = (page - 1) * limit

  const [calls, total] = await Promise.all([
    db.callLog.findMany({
      where: { agentProfileId: profileId },
      orderBy: { callDate: 'desc' },
      skip,
      take: limit,
    }),
    db.callLog.count({ where: { agentProfileId: profileId } }),
  ])

  return NextResponse.json({ calls, total, page })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(agentAuthOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json() as {
    callDate: string
    contactName: string
    phoneNumber?: string
    subject?: string
    notes?: string
    result?: string
    followUpNeeded?: boolean
  }

  if (!body.callDate || !body.contactName) {
    return NextResponse.json({ error: 'callDate and contactName required' }, { status: 400 })
  }

  const call = await db.callLog.create({
    data: {
      agentProfileId: profileId,
      callDate: new Date(body.callDate),
      contactName: body.contactName,
      phoneNumber: body.phoneNumber,
      subject: body.subject,
      notes: body.notes,
      result: body.result,
      followUpNeeded: body.followUpNeeded ?? false,
    },
  })

  return NextResponse.json(call)
}
