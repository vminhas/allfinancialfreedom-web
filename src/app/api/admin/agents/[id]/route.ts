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
    }

    // Public promotion card + DM. Goes out regardless of whether the
    // agent has linked Discord — the announcements post is still
    // worth firing for the team. The DM only attempts when discordUserId
    // is set (otherwise we have nowhere to send it).
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const { buildAchievementEmbed, PHASE_ACCENT, PHASE_TITLE } = await import('@/lib/discord-card')

      const phaseGoals: Record<number, string> = {
        2: 'Complete 10 Field Training Appointments and help your first 3 clients.',
        3: 'Get all sign-offs and master the core product suite.',
        4: 'Hit 45,000 points and build a team of 5 licensed agents.',
        5: 'Reach 150,000 net points in 6 months and develop a Marketing Director.',
      }

      const accent = PHASE_ACCENT[newPhase] ?? 0xC9A96E
      const newTitle = PHASE_TITLE[newPhase] ?? `Phase ${newPhase}`

      const announcementCard = buildAchievementEmbed({
        flavor: 'PROMOTION',
        protagonist: {
          firstName: existing.firstName,
          lastName: existing.lastName,
          agentCode: existing.agentCode,
          avatarUrl: existing.avatarUrl,
        },
        subline: `Promoted to **${newTitle}**`,
        fields: [
          { name: 'New phase', value: newTitle, inline: true },
          { name: 'Agent',     value: '`' + existing.agentCode + '`', inline: true },
          ...(phaseGoals[newPhase] ? [{ name: 'Next milestone', value: phaseGoals[newPhase] }] : []),
        ],
        accentOverride: accent,
      })

      // Public broadcast
      const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
      await sendChannelMessage(announcementsChannel, { embeds: [announcementCard] }).catch(() => {})

      // DM to the promoted agent
      if (existing.discordUserId) {
        const dmChannelRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
          method: 'POST',
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient_id: existing.discordUserId }),
        })
        if (dmChannelRes.ok) {
          const dmChannel = await dmChannelRes.json() as { id: string }
          await sendChannelMessage(dmChannel.id, { embeds: [announcementCard] })
        }
      }
    } catch {
      // Non-fatal: promotion still goes through even if Discord fails
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
    'isLeadership',
    // Couples (power-couple pairing) — set from the tracker edit
    // drawer. One-sided uses partnerDisplayName + coupleDisplayName
    // only; two-sided also sets partnerAgentProfileId on both rows.
    'partnerAgentProfileId',
    'partnerDisplayName',
    'coupleDisplayName',
    'coupleAvatarUrl',
    // Earned-recognition list. Manual override path; auto-managed
    // updates flow through recomputeBadges() in lib/agent-badges.
    'badges',
  ] as const

  // Date-shaped columns that arrive as 'YYYY-MM-DD' from <input type="date">
  // and need coercion to Date | null before Prisma will accept them. Without
  // this, saving an unrelated checkbox (like isTest) fails because the form
  // re-sends every field including the bare date strings.
  const dateFields = new Set<string>([
    'dateOfBirth', 'icaDate', 'phaseStartedAt', 'examDate',
    'dateSubmittedToGfi', 'discordJoinDate', 'welcomeLetterSentAt',
  ])

  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (!(key in body)) continue
    const raw = body[key]
    if (dateFields.has(key)) {
      if (raw === null || raw === '' || raw === undefined) {
        data[key] = null
      } else if (raw instanceof Date) {
        data[key] = raw
      } else {
        const parsed = new Date(raw as string)
        data[key] = isNaN(parsed.getTime()) ? null : parsed
      }
    } else if (key === 'phone' && typeof raw === 'string') {
      // Strip float suffix from CSV imports that stored phone as a number (e.g. "4696556307.0")
      data[key] = raw.replace(/\.0+$/, '') || null
    } else {
      data[key] = raw
    }
  }

  const updated = await db.agentProfile.update({ where: { id }, data })

  // Couples: auto-sync the reciprocal partner pointer so admins only
  // have to edit one side of the pair. If this PUT set
  // partnerAgentProfileId to a real agent, also point that agent
  // back at this one. If this PUT cleared the partner pointer, clear
  // the previously-pointed-at agent's pointer too (when it was
  // pointing back at this row).
  if ('partnerAgentProfileId' in data) {
    const newPartnerId = data.partnerAgentProfileId as string | null
    const oldPartnerId = (existing as { partnerAgentProfileId?: string | null }).partnerAgentProfileId ?? null
    if (newPartnerId && newPartnerId !== oldPartnerId) {
      await db.agentProfile.update({
        where: { id: newPartnerId },
        data: { partnerAgentProfileId: id },
      }).catch(() => { /* partner missing or update raced; safe to ignore */ })
    }
    if (oldPartnerId && oldPartnerId !== newPartnerId) {
      // Clear the old partner's reciprocal pointer only if it still
      // points at this row — avoid stomping a hand-managed pairing.
      await db.agentProfile.updateMany({
        where: { id: oldPartnerId, partnerAgentProfileId: id },
        data: { partnerAgentProfileId: null },
      }).catch(() => {})
    }
  }

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
    // When we have a match, offer the kick directly. When we don't,
    // offer a "Search by name" button that opens a Discord modal so
    // the admin can find the right user manually without leaving
    // the channel.
    components: discordMatch ? [{
      type: 1,
      components: [{
        type: 2,
        style: 4,  // danger
        label: 'Kick from Discord',
        custom_id: `agent-kick:${discordMatch.id}:${args.agentProfileId}`,
      }],
    }] : [{
      type: 1,
      components: [{
        type: 2,
        style: 2,  // secondary
        label: 'Search Discord by name',
        custom_id: `agent-search:${args.agentProfileId}`,
      }],
    }],
  }).catch(() => {})
}

