import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

const LICENSING_ITEM_KEYS = [
  'licensing_class',
  'pass_license_test',
  'fingerprints_apply',
  'submit_to_aff',
  'ce_courses',
  'errors_and_omissions',
  'fully_appointed',
  'direct_deposit',
]

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const [agents, completions, carriers] = await Promise.all([
    db.agentProfile.findMany({
      where: { isTest: false },
      select: {
        id: true,
        agentCode: true,
        firstName: true,
        lastName: true,
        phase: true,
        state: true,
        status: true,
        examDate: true,
        licenseNumber: true,
        npn: true,
        dateSubmittedToGfi: true,
        tevahAgentId: true,
        agentUser: { select: { email: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    db.phaseItem.findMany({
      where: { itemKey: { in: LICENSING_ITEM_KEYS } },
      select: { agentProfileId: true, itemKey: true, completed: true, completedAt: true },
    }),
    db.carrierAppointment.findMany({
      select: { agentProfileId: true, carrier: true, status: true },
    }),
  ])

  const completedMap: Record<string, string> = {}
  for (const c of completions) {
    if (c.completed) {
      completedMap[`${c.agentProfileId}:${c.itemKey}`] = c.completedAt?.toISOString() ?? ''
    }
  }

  const carriersByAgent: Record<string, { total: number; appointed: number; pending: number; carriers: { carrier: string; status: string }[] }> = {}
  for (const ca of carriers) {
    if (!carriersByAgent[ca.agentProfileId]) {
      carriersByAgent[ca.agentProfileId] = { total: 0, appointed: 0, pending: 0, carriers: [] }
    }
    const entry = carriersByAgent[ca.agentProfileId]
    entry.total++
    if (ca.status === 'APPOINTED') entry.appointed++
    else if (ca.status === 'PENDING') entry.pending++
    entry.carriers.push({ carrier: ca.carrier, status: ca.status })
  }

  const flatAgents = agents.map(a => ({
    id: a.id,
    agentCode: a.agentCode,
    firstName: a.firstName,
    lastName: a.lastName,
    phase: a.phase,
    state: a.state,
    status: a.status,
    examDate: a.examDate?.toISOString() ?? null,
    licenseNumber: a.licenseNumber,
    npn: a.npn,
    dateSubmittedToGfi: a.dateSubmittedToGfi?.toISOString() ?? null,
    subscribedToTevah: a.tevahAgentId != null,
    email: a.agentUser?.email ?? null,
    carriers: carriersByAgent[a.id] ?? { total: 0, appointed: 0, pending: 0, carriers: [] },
  }))

  return NextResponse.json({
    agents: flatAgents,
    items: LICENSING_ITEM_KEYS,
    completedMap,
  })
}
