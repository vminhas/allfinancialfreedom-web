import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Clients = filtered view of issued submissions. Gated at phase >= 4
// (Marketing Director track). Below that, the agent shouldn't be reaching
// for client-management workflows yet.
const CLIENTS_MIN_PHASE = 4

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const profile = await db.agentProfile.findFirst({
    where: { agentUser: { email: session.user!.email! } },
    select: { id: true, phase: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (profile.phase < CLIENTS_MIN_PHASE) {
    return NextResponse.json({ error: 'Locked', minPhase: CLIENTS_MIN_PHASE, phase: profile.phase }, { status: 403 })
  }

  const clients = await db.newBusinessSubmission.findMany({
    where: { agentProfileId: profile.id, status: 'ISSUED' },
    orderBy: { issuedDate: 'desc' },
    select: {
      id: true,
      clientFirstName: true,
      clientLastName: true,
      clientPhone: true,
      clientEmail: true,
      clientBirthday: true,
      clientAddressLine1: true,
      clientAddressLine2: true,
      clientCity: true,
      clientState: true,
      clientZip: true,
      carrier: true,
      policyType: true,
      policyNumber: true,
      issuedDate: true,
      points: true,
    },
  })
  return NextResponse.json({ clients })
}
