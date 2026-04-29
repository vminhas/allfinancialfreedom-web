import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import type { FtaCategory } from '@/generated/prisma/client'

const VALID_CATEGORIES: FtaCategory[] = [
  'UNDER_50', 'FIFTY_PLUS', 'FIFTY_NINE_HALF_PLUS',
  'JUST_RETIRED', 'TRANSITIONING_JOBS', 'RECEIVED_INHERITANCE',
]

const EDITABLE = [
  'name', 'phone', 'timeZone', 'age', 'married', 'children',
  'homeowner', 'occupation60kPlus', 'appointmentDate', 'notes', 'category',
] as const

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

async function ownsFta(profileId: string, ftaId: string): Promise<boolean> {
  const f = await db.fieldTrainingAppointment.findUnique({ where: { id: ftaId }, select: { agentProfileId: true } })
  return !!f && f.agentProfileId === profileId
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profileId = await getAgentProfileId()
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!(await ownsFta(profileId, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>
  const data: Record<string, unknown> = {}
  for (const f of EDITABLE) {
    if (!(f in body)) continue
    const v = body[f]
    if (f === 'appointmentDate') data[f] = v ? new Date(v as string) : undefined
    else if (f === 'age' || f === 'children') data[f] = v == null || v === '' ? null : Number(v)
    else if (f === 'married' || f === 'homeowner' || f === 'occupation60kPlus') data[f] = v == null ? null : Boolean(v)
    else if (f === 'category') {
      if (v != null && v !== '' && !VALID_CATEGORIES.includes(v as FtaCategory)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
      }
      data[f] = v || null
    } else data[f] = v === '' ? null : v
  }

  const updated = await db.fieldTrainingAppointment.update({ where: { id }, data })
  return NextResponse.json({ fta: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profileId = await getAgentProfileId()
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!(await ownsFta(profileId, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.fieldTrainingAppointment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
