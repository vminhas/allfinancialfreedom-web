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

      // Send celebration DM + announcement post
      try {
        const { sendChannelMessage } = await import('@/lib/discord')
        const phaseTitles: Record<number, string> = {
          1: 'Getting Started', 2: 'Field Training', 3: 'Becoming a CFT',
          4: 'Marketing Director Focus', 5: 'EMD Focus',
        }
        const phaseGoals: Record<number, string> = {
          2: 'Complete 10 Field Training Appointments and help your first 3 clients.',
          3: 'Get all sign-offs and master the core product suite.',
          4: 'Hit 45,000 points and build a team of 5 licensed agents.',
          5: 'Reach 150,000 net points in 6 months and develop a Marketing Director.',
        }

        // DM the agent
        const dmChannelRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
          method: 'POST',
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient_id: existing.discordUserId }),
        })
        if (dmChannelRes.ok) {
          const dmChannel = await dmChannelRes.json() as { id: string }
          await sendChannelMessage(dmChannel.id, {
            embeds: [{
              title: `Congratulations! You've been promoted to Phase ${newPhase}`,
              description: [
                `**Phase ${newPhase}: ${phaseTitles[newPhase] ?? ''}**`,
                '',
                "You've unlocked new training channels and resources. Your next milestone:",
                phaseGoals[newPhase] ?? 'Keep building.',
                '',
                'Your team is behind you every step of the way.',
              ].join('\n'),
              color: 0xC9A96E,
              footer: { text: 'All Financial Freedom' },
            }],
          })
        }

        // Post celebration in announcements
        const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
        await sendChannelMessage(announcementsChannel, {
          content: `**${existing.firstName} ${existing.lastName}** has been promoted to **Phase ${newPhase}: ${phaseTitles[newPhase] ?? ''}**! Congratulations!`,
        }).catch(() => {})
      } catch {
        // Non-fatal: promotion still goes through even if Discord fails
      }
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
