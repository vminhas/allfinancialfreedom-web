import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import type { FtaCategory } from '@/generated/prisma/client'

const VALID_CATEGORIES: FtaCategory[] = [
  'UNDER_50', 'FIFTY_PLUS', 'FIFTY_NINE_HALF_PLUS',
  'JUST_RETIRED', 'TRANSITIONING_JOBS', 'RECEIVED_INHERITANCE',
]

async function getAgentProfileId() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') return null
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) return null
  const p = await db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true },
  })
  return p?.id ?? null
}

export async function GET() {
  const profileId = await getAgentProfileId()
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ftas = await db.fieldTrainingAppointment.findMany({
    where: { agentProfileId: profileId },
    orderBy: { appointmentDate: 'desc' },
    include: {
      businessPartner: {
        select: { id: true, name: true, phone: true, email: true, occupation: true, category: true },
      },
    },
  })
  return NextResponse.json({ ftas })
}

export async function POST(req: NextRequest) {
  const profileId = await getAgentProfileId()
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json() as Record<string, unknown>
  if (!body.appointmentDate) {
    return NextResponse.json({ error: 'appointmentDate is required' }, { status: 400 })
  }
  const category = (body.category as FtaCategory | undefined) || null
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  // If a businessPartnerId is supplied, verify it belongs to the agent
  // and snapshot name/phone from the BP record so the FTA still reads
  // even if the contact is later renamed or deleted.
  const businessPartnerId = (body.businessPartnerId as string) || null
  let snapshotName: string | null = (body.name as string) || null
  let snapshotPhone: string | null = (body.phone as string) || null
  if (businessPartnerId) {
    const bp = await db.businessPartner.findUnique({
      where: { id: businessPartnerId },
      select: { agentProfileId: true, name: true, phone: true },
    })
    if (!bp || bp.agentProfileId !== profileId) {
      return NextResponse.json({ error: 'Invalid FTA contact' }, { status: 400 })
    }
    if (!snapshotName) snapshotName = bp.name
    if (!snapshotPhone) snapshotPhone = bp.phone ?? null
  }

  if (!snapshotName) {
    return NextResponse.json({ error: 'name or businessPartnerId is required' }, { status: 400 })
  }

  const fta = await db.fieldTrainingAppointment.create({
    data: {
      agentProfileId: profileId,
      businessPartnerId,
      name: snapshotName,
      phone: snapshotPhone,
      timeZone: (body.timeZone as string) || null,
      age: body.age != null && body.age !== '' ? Number(body.age) : null,
      married: body.married == null ? null : Boolean(body.married),
      children: body.children != null && body.children !== '' ? Number(body.children) : null,
      homeowner: body.homeowner == null ? null : Boolean(body.homeowner),
      occupation60kPlus: body.occupation60kPlus == null ? null : Boolean(body.occupation60kPlus),
      appointmentDate: new Date(body.appointmentDate as string),
      notes: (body.notes as string) || null,
      category,
    },
  })
  return NextResponse.json({ fta })
}
