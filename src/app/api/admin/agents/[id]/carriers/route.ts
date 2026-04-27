import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/agents/[id]/carriers
// Both admins and licensing coordinators can read carrier appointments.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const appointments = await db.carrierAppointment.findMany({
    where: { agentProfileId: id },
    orderBy: { carrier: 'asc' },
  })
  return NextResponse.json(appointments)
}

// PUT /api/admin/agents/[id]/carriers — bulk update carrier statuses
// Both admins and licensing coordinators can update — LC owns carrier
// appointments and producer numbers as part of their workflow.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const updates = await req.json() as {
    carrier: string
    status: 'NOT_STARTED' | 'PENDING' | 'APPOINTED' | 'JIT'
    producerNumber?: string
    appointedDate?: string
  }[]

  await Promise.all(
    updates.map(u =>
      db.carrierAppointment.upsert({
        where: { agentProfileId_carrier: { agentProfileId: id, carrier: u.carrier } },
        update: {
          status: u.status,
          producerNumber: u.producerNumber ?? null,
          appointedDate: u.appointedDate ? new Date(u.appointedDate) : null,
        },
        create: {
          agentProfileId: id,
          carrier: u.carrier,
          status: u.status,
          producerNumber: u.producerNumber ?? null,
          appointedDate: u.appointedDate ? new Date(u.appointedDate) : null,
        },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
