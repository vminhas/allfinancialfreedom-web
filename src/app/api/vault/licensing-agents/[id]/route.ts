import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// Fields the Licensing Coordinator is allowed to edit. Anything else is
// rejected so LC cannot escalate their own permissions via this endpoint.
const ALLOWED_FIELDS = [
  'examDate',
  'licenseNumber',
  'licenseLines',
  'npn',
  'dateSubmittedToGfi',
] as const
type AllowedField = typeof ALLOWED_FIELDS[number]

function isDateField(key: string) {
  return key === 'examDate' || key === 'dateSubmittedToGfi'
}

// GET /api/vault/licensing-agents/[id]
// Returns a single agent with licensing-relevant fields + carrier appointments
// + request history.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const profile = await db.agentProfile.findUnique({
    where: { id },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      state: true,
      phase: true,
      phone: true,
      examDate: true,
      licenseNumber: true,
      licenseLines: true,
      npn: true,
      dateSubmittedToGfi: true,
      icaDate: true,
      agentUser: { select: { email: true } },
      carrierAppointments: {
        orderBy: { carrier: 'asc' },
        select: { carrier: true, status: true, producerNumber: true, appointedDate: true },
      },
      coordinatorRequests: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          phaseItemKey: true,
          topic: true,
          message: true,
          status: true,
          resolutionNote: true,
          createdAt: true,
          resolvedAt: true,
          assignedTo: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!profile) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  return NextResponse.json({ agent: profile })
}

// PATCH /api/vault/licensing-agents/[id]
// Whitelist: only licensing fields. Any attempt to update other fields is rejected.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.includes(key as AllowedField)) {
      return NextResponse.json(
        { error: `Field '${key}' is not allowed. Licensing coordinators can only update: ${ALLOWED_FIELDS.join(', ')}` },
        { status: 400 }
      )
    }
    if (value === null || value === '') {
      data[key] = null
    } else if (isDateField(key) && typeof value === 'string') {
      data[key] = new Date(value)
    } else {
      data[key] = value
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const profile = await db.agentProfile.update({
    where: { id },
    data,
    select: {
      id: true,
      examDate: true,
      licenseNumber: true,
      licenseLines: true,
      npn: true,
      dateSubmittedToGfi: true,
    },
  })

  return NextResponse.json({ agent: profile })
}
