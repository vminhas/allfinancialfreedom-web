import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/agents/tracker-records?type=business_partner|field_appointment
// Returns the agent's BPs or completed FTAs for use in the slot picker.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user?.email
  if (typeof email !== 'string') return NextResponse.json({ error: 'No email' }, { status: 401 })

  const agentUser = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!agentUser?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const agentProfileId = agentUser.profile.id
  const type = new URL(req.url).searchParams.get('type')

  if (type === 'business_partner') {
    const bps = await db.businessPartner.findMany({
      where: { agentProfileId },
      select: { id: true, name: true, category: true, occupation: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ records: bps })
  }

  if (type === 'field_appointment') {
    const ftas = await db.fieldTrainingAppointment.findMany({
      where: { agentProfileId, status: 'COMPLETED' },
      select: {
        id: true,
        name: true,
        appointmentDate: true,
        businessPartner: { select: { id: true, name: true } },
      },
      orderBy: { appointmentDate: 'desc' },
    })
    return NextResponse.json({ records: ftas })
  }

  return NextResponse.json({ error: 'type must be business_partner or field_appointment' }, { status: 400 })
}
