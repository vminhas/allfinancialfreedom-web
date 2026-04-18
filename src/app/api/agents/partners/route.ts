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

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50
  const skip = (page - 1) * limit

  const [partners, total] = await Promise.all([
    db.businessPartner.findMany({
      where: { agentProfileId: profileId },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    db.businessPartner.count({ where: { agentProfileId: profileId } }),
  ])

  return NextResponse.json({ partners, total, page })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json() as {
    name: string
    phone?: string
    timeZone?: string
    age?: string
    married?: boolean
    children?: boolean
    occupation?: string
    characterTraits?: string
    appointmentDate?: string
    notes?: string
    phaseItemKey?: string
  }

  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const partner = await db.businessPartner.create({
    data: {
      agentProfileId: profileId,
      name: body.name,
      phone: body.phone,
      timeZone: body.timeZone,
      age: body.age,
      married: body.married ?? false,
      children: body.children ?? false,
      occupation: body.occupation,
      characterTraits: body.characterTraits,
      appointmentDate: body.appointmentDate ? new Date(body.appointmentDate) : null,
      notes: body.notes,
      phaseItemKey: body.phaseItemKey,
    },
  })

  return NextResponse.json(partner)
}
