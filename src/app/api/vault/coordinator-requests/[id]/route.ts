import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole, isAdmin, isLicensingCoordinator } from '@/lib/permissions'

// GET /api/vault/coordinator-requests/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const request = await db.coordinatorRequest.findUnique({
    where: { id },
    include: {
      agentProfile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          agentCode: true,
          phone: true,
          phase: true,
          licenseNumber: true,
          npn: true,
          examDate: true,
          state: true,
          agentUser: { select: { email: true } },
        },
      },
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
    },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ request })
}

// PATCH /api/vault/coordinator-requests/[id]
// Body: { status?, assignedToId?, resolutionNote? }
// - LC can assign to self and update status/resolution
// - LC cannot reassign to someone else
// - Admin can reassign, update status, add resolution
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const selfId = (session!.user as { id?: string }).id

  const body = await req.json() as {
    status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
    assignedToId?: string | null
    resolutionNote?: string | null
  }

  const existing = await db.coordinatorRequest.findUnique({
    where: { id },
    select: { assignedToId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // LC can only assign to themselves — not reassign to others
  if (body.assignedToId !== undefined && isLicensingCoordinator(session)) {
    if (body.assignedToId !== selfId && body.assignedToId !== null) {
      return NextResponse.json(
        { error: 'Licensing coordinators can only assign requests to themselves' },
        { status: 403 }
      )
    }
  }

  // Admin-only: full reassignment
  if (body.assignedToId !== undefined && !isAdmin(session) && !isLicensingCoordinator(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) {
    data.status = body.status
    if (body.status === 'RESOLVED' || body.status === 'CLOSED') {
      data.resolvedAt = new Date()
    }
  }
  if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId
  if (body.resolutionNote !== undefined) data.resolutionNote = body.resolutionNote

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await db.coordinatorRequest.update({
    where: { id },
    data,
    include: {
      agentProfile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          agentCode: true,
          phone: true,
          phase: true,
          licenseNumber: true,
          npn: true,
          examDate: true,
          state: true,
          agentUser: { select: { email: true } },
        },
      },
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
    },
  })

  return NextResponse.json({ request: updated })
}
