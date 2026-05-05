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

  // Recruiter name lookup. AgentProfile.recruiterId stores the
  // recruiter's agentCode (not the recruiter's database id), so we
  // resolve it here and surface a small object the drawer can render
  // as "Recruited by X" without a second client round-trip.
  const recruiter = profile.recruiterId
    ? await db.agentProfile.findUnique({
        where: { agentCode: profile.recruiterId },
        select: { firstName: true, lastName: true, agentCode: true },
      })
    : null

  return NextResponse.json({ ...profile, ssn: ssnFormatted, recruiter })
}

// PUT /api/admin/agents/[id] — update agent profile
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Wrap the whole handler so any thrown error returns proper JSON
  // instead of an HTML 500 page from Vercel. The frontend reads error
  // messages out of res.json(); a non-JSON response makes the form hang
  // on the parse step. Reproduced on test@allfinancialfreedom.com which
  // had some legacy data state that made a downstream Prisma call throw.
  try {
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
    'isTest',
  ] as const

  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) data[key] = body[key]
  }

  const updated = await db.agentProfile.update({ where: { id }, data })

  // Status flipped to INACTIVE — post an admin-channel notice with a
  // "Kick from Discord" button so we can clean up the server in one
  // click. Discord lookup falls back to a name search when the agent
  // doesn't have a discordUserId on file. Best-effort throughout: a
  // missing Discord match (or a Discord outage) doesn't block the
  // status update.
  if (data.status === 'INACTIVE' && existing.status !== 'INACTIVE' && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    notifyDeactivation({
      agentProfileId: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      agentCode: existing.agentCode,
      knownDiscordId: existing.discordUserId,
    }).catch(err => console.warn('[agents PUT] deactivation notify failed:', err))
  }

  // Update email on the AgentUser record if provided. Wrapped because
  // legacy profiles can have an agentUserId that points to a deleted
  // user row (P2025); when that happens, the profile update has
  // already succeeded and we don't want to fail the whole request
  // just because the email side-update can't find a row.
  if (typeof body.email === 'string' && body.email.trim()) {
    try {
      await db.agentUser.update({
        where: { id: existing.agentUserId },
        data: { email: body.email.toLowerCase().trim() },
      })
    } catch (err) {
      console.warn('[agents PUT] agentUser email update failed (non-fatal):', err)
    }
  }

  return NextResponse.json(updated)
  } catch (err) {
    console.error('[agents PUT] failed:', err)
    const msg = err instanceof Error ? err.message : 'Unknown server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
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

// ─── Deactivation notifier ─────────────────────────────────────────────

// Post an admin-channel embed when an agent gets flipped to INACTIVE,
// with an optional 'Kick from Discord' button so the team can clean
// up the server in one click. Looks up the agent's Discord member by
// stored user ID first, falling back to a name search when the
// agent profile has no discordUserId on file (the search needs the
// GUILD_MEMBERS privileged intent enabled on the bot).
async function notifyDeactivation(args: {
  agentProfileId: string
  firstName: string
  lastName: string
  agentCode: string
  knownDiscordId: string | null
}) {
  const channelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  if (!channelId) return

  const { sendChannelMessage, searchGuildMembers } = await import('@/lib/discord')
  const fullName = `${args.firstName} ${args.lastName}`.trim()

  // Resolve Discord member: prefer the stored user ID; fall back to
  // a fuzzy name search across guild membership.
  let discordMatch: { id: string; label: string } | null = null
  if (args.knownDiscordId) {
    discordMatch = { id: args.knownDiscordId, label: `<@${args.knownDiscordId}>` }
  } else {
    const candidates = await searchGuildMembers(fullName, 5)
    if (candidates.length > 0) {
      const top = candidates[0]
      const display = top.user.global_name ?? top.user.username
      discordMatch = { id: top.user.id, label: `${display} (<@${top.user.id}>)` }
    }
  }

  const fields = [
    { name: 'Agent Code', value: `\`${args.agentCode}\``, inline: true },
    { name: 'Discord',    value: discordMatch ? discordMatch.label : '_not found in guild_', inline: true },
  ]

  await sendChannelMessage(channelId, {
    embeds: [{
      title: '⚠️ Agent marked inactive',
      description: `**${fullName}** has been deactivated. They're hidden from the matrix and the leaderboard.`,
      color: 0xF59E0B,
      fields,
      footer: { text: 'AFF Concierge · Deactivation' },
      timestamp: new Date().toISOString(),
    }],
    components: discordMatch ? [{
      type: 1,
      components: [{
        type: 2,
        style: 4,  // danger
        label: 'Kick from Discord',
        custom_id: `agent-kick:${discordMatch.id}:${args.agentProfileId}`,
      }],
    }] : undefined,
  }).catch(() => {})
}

