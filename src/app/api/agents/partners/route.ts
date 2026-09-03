import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { autoLinkAgentForBusinessPartner } from '@/lib/business-partner-link'

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const { searchParams } = new URL(req.url)
  const categoryFilter = searchParams.get('category')

  const where = {
    agentProfileId: id.profileId,
    ...(categoryFilter ? { category: categoryFilter } : {}),
  }

  const partners = await db.businessPartner.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      linkedAgentProfile: {
        select: { id: true, agentCode: true, npn: true, licenseNumber: true },
      },
    },
  })

  return NextResponse.json({ partners })
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
  status?: string
  notes?: string
  phaseItemKey?: string
}

export async function POST(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const body = await req.json() as PartnerBody
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const partner = await db.businessPartner.create({
    data: {
      agentProfileId: id.profileId,
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
      status: body.status ?? 'PENDING',
      appointmentDate: body.appointmentDate ? new Date(body.appointmentDate) : null,
      icaDate: body.icaDate ? new Date(body.icaDate) : null,
      firstCallDate: body.firstCallDate ? new Date(body.firstCallDate) : null,
      secondCallDate: body.secondCallDate ? new Date(body.secondCallDate) : null,
      bookedAppt: body.bookedAppt ?? false,
      notes: body.notes,
      phaseItemKey: body.phaseItemKey,
    },
  })

  // If the contact's email matches an existing AgentUser, link the rows
  // immediately. Reverse direction (agent created → sweep BPs) handled
  // in /api/admin/agents.
  if (partner.email) {
    await autoLinkAgentForBusinessPartner({ businessPartnerId: partner.id, email: partner.email })
  }

  return NextResponse.json(partner)
}

const UPDATABLE = [
  'name', 'email', 'phone', 'timeZone', 'age', 'married', 'children',
  'homeowner', 'occupation', 'characterTraits', 'category', 'bookedAppt', 'notes',
] as const

const DATE_FIELDS = ['appointmentDate', 'icaDate', 'firstCallDate', 'secondCallDate'] as const

export async function PUT(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const body = await req.json() as Record<string, unknown> & { id: string }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await db.businessPartner.findUnique({ where: { id: body.id } })
  if (!existing || existing.agentProfileId !== id.profileId) {
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

export async function DELETE(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const body = await req.json() as { ids?: string[]; id?: string }
  // Accept either a single id or an array for bulk delete.
  const targetIds = body.ids?.length ? body.ids : (body.id ? [body.id] : [])
  if (targetIds.length === 0) return NextResponse.json({ error: 'id(s) required' }, { status: 400 })

  // Only delete contacts owned by this agent. Even if a malicious caller
  // sends someone else's id, the agentProfileId filter drops it.
  const result = await db.businessPartner.deleteMany({
    where: { id: { in: targetIds }, agentProfileId: id.profileId },
  })

  return NextResponse.json({ deleted: result.count })
}
