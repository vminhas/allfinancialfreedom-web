import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/settings'
import { PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'
import { assignDiscordPhaseRole } from '@/lib/discord-roles'

// GET /api/admin/agents/[id] — full agent detail
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const profile = await db.agentProfile.findUnique({
    where: { id },
    include: {
      agentUser: { select: { email: true, lastLoginAt: true } },
      phaseItems: true,
      carrierAppointments: true,
      milestones: { orderBy: { completedAt: 'desc' } },
      _count: { select: { businessPartners: true, policies: true, callLogs: true } },
    },
  })

  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Decrypt SSN for admin view — never send encrypted blob to client
  const ssnDecrypted = profile.ssn ? decrypt(profile.ssn) : null
  const ssnFormatted = ssnDecrypted?.length === 9
    ? `${ssnDecrypted.slice(0, 3)}-${ssnDecrypted.slice(3, 5)}-${ssnDecrypted.slice(5)}`
    : null

  return NextResponse.json({ ...profile, ssn: ssnFormatted })
}

// PUT /api/admin/agents/[id] — update agent profile
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  const existing = await db.agentProfile.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Handle phase advancement — seed new phase items + trigger Discord role
  const newPhase = typeof body.phase === 'number' ? body.phase : undefined
  if (newPhase && newPhase !== existing.phase) {
    const existingKeys = await db.phaseItem.findMany({
      where: { agentProfileId: id, phase: newPhase },
      select: { itemKey: true },
    })
    const existingKeySet = new Set(existingKeys.map(i => i.itemKey))
    const newItems = (PHASE_ITEMS[newPhase] ?? []).filter(i => !existingKeySet.has(i.key))

    if (newItems.length > 0) {
      await db.phaseItem.createMany({
        data: newItems.map(item => ({
          agentProfileId: id,
          phase: newPhase,
          itemKey: item.key,
          completed: false,
        })),
        skipDuplicates: true,
      })
    }

    // Assign Discord role if agent has a Discord user ID
    if (existing.discordUserId) {
      assignDiscordPhaseRole(existing.discordUserId, newPhase, existing.phase).catch(() => {})
    }

    body.phaseStartedAt = new Date()
  }

  // Whitelist updatable fields
  const allowed = [
    'firstName', 'lastName', 'state', 'phone', 'dateOfBirth', 'npn',
    'icaDate', 'recruiterId', 'cft', 'eliteCft', 'status', 'phase',
    'phaseStartedAt', 'goal', 'initialPointOfContact', 'examDate',
    'licenseNumber', 'licenseLines', 'dateSubmittedToGfi', 'discordJoinDate',
    'discordUserId', 'welcomeLetterSentAt', 'clientProduct', 'licenseProcess', 'notes',
    'addressLine1', 'addressLine2', 'city', 'zip', 'country', 'avatarUrl',
  ] as const

  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) data[key] = body[key]
  }

  const updated = await db.agentProfile.update({ where: { id }, data })
  return NextResponse.json(updated)
}

// DELETE /api/admin/agents/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const profile = await db.agentProfile.findUnique({
    where: { id },
    select: { agentUserId: true },
  })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete in dependency order
  await db.callLog.deleteMany({ where: { agentProfileId: id } })
  await db.policyEntry.deleteMany({ where: { agentProfileId: id } })
  await db.businessPartner.deleteMany({ where: { agentProfileId: id } })
  await db.recognitionMilestone.deleteMany({ where: { agentProfileId: id } })
  await db.carrierAppointment.deleteMany({ where: { agentProfileId: id } })
  await db.phaseItem.deleteMany({ where: { agentProfileId: id } })
  await db.agentProfile.delete({ where: { id } })
  await db.agentUser.delete({ where: { id: profile.agentUserId } })

  return NextResponse.json({ ok: true })
}
