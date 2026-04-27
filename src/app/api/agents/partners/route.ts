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
  const limit = 100
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

interface PartnerBody {
  name: string
  email?: string
  phone?: string
  timeZone?: string
  age?: string
  married?: boolean
  children?: boolean
  homeowner?: boolean
  occupation?: string
  characterTraits?: string
  category?: string
  appointmentDate?: string
  icaDate?: string
  firstCallDate?: string
  secondCallDate?: string
  bookedAppt?: boolean
  notes?: string
  phaseItemKey?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json() as PartnerBody
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const partner = await db.businessPartner.create({
    data: {
      agentProfileId: profileId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      timeZone: body.timeZone,
      age: body.age,
      married: body.married ?? false,
      children: body.children ?? false,
      homeowner: body.homeowner ?? false,
      occupation: body.occupation,
      characterTraits: body.characterTraits,
      category: body.category,
      appointmentDate: body.appointmentDate ? new Date(body.appointmentDate) : null,
      icaDate: body.icaDate ? new Date(body.icaDate) : null,
      firstCallDate: body.firstCallDate ? new Date(body.firstCallDate) : null,
      secondCallDate: body.secondCallDate ? new Date(body.secondCallDate) : null,
      bookedAppt: body.bookedAppt ?? false,
      notes: body.notes,
      phaseItemKey: body.phaseItemKey,
    },
  })

  return NextResponse.json(partner)
}

const UPDATABLE = [
  'name', 'email', 'phone', 'timeZone', 'age', 'married', 'children',
  'homeowner', 'occupation', 'characterTraits', 'category', 'bookedAppt', 'notes',
] as const

const DATE_FIELDS = ['appointmentDate', 'icaDate', 'firstCallDate', 'secondCallDate'] as const

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json() as Record<string, unknown> & { id: string }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await db.businessPartner.findUnique({ where: { id: body.id } })
  if (!existing || existing.agentProfileId !== profileId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  for (const key of UPDATABLE) {
    if (body[key] !== undefined) data[key] = body[key]
  }
  for (const key of DATE_FIELDS) {
    if (body[key] !== undefined) {
      data[key] = body[key] ? new Date(body[key] as string) : null
    }
  }

  const updated = await db.businessPartner.update({ where: { id: body.id }, data })
  return NextResponse.json(updated)
}
