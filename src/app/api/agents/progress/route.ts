import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHASE_ITEMS } from '@/lib/agent-constants'

// PUT /api/agents/progress — toggle a phase item checkbox
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemKey, phase, completed } = await req.json() as {
    itemKey: string
    phase: number
    completed: boolean
  }

  if (!itemKey || !phase) {
    return NextResponse.json({ error: 'itemKey and phase required' }, { status: 400 })
  }

  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }
  const agentUser = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true, phase: true } } },
  })
  if (!agentUser?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Agents can toggle items across any phase — onboarding progresses
  // asynchronously (e.g. you can schedule FTAs in Phase 2 while still waiting
  // on your license from Phase 1). Just validate the item exists in that phase.
  const validKeys = PHASE_ITEMS[phase]?.map(i => i.key) ?? []
  if (!validKeys.includes(itemKey)) {
    return NextResponse.json({ error: 'Invalid item key for this phase' }, { status: 400 })
  }

  // Read the prior state so we can decide whether the upsert is a real
  // transition (not-complete -> complete) or a no-op re-check. Without
  // this guard the "Ready for Promotion" notification fires every time
  // an already-100% phase has any item re-checked. We also need the
  // previously-stored Discord message IDs so an uncheck can DELETE the
  // celebratory posts instead of leaving them orphaned in the channel.
  const prior = await db.phaseItem.findUnique({
    where: {
      agentProfileId_phase_itemKey: {
        agentProfileId: agentUser.profile.id,
        phase,
        itemKey,
      },
    },
    select: { completed: true, activityMsgId: true, announcementMsgId: true },
  })
  const wasCompleted = prior?.completed ?? false

  const item = await db.phaseItem.upsert({
    where: {
      agentProfileId_phase_itemKey: {
        agentProfileId: agentUser.profile.id,
        phase,
        itemKey,
      },
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
    },
    create: {
      agentProfileId: agentUser.profile.id,
      phase,
      itemKey,
      completed,
      completedAt: completed ? new Date() : null,
    },
  })

  const isRealTransition = completed && !wasCompleted
  const isRealRetraction = !completed && wasCompleted

  // Channel + user IDs are env-overridable but ship with sensible
  // production fallbacks so the feature works without Vercel config.
  const ACTIVITY_CHANNEL = process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID ?? '1501070249695383622'
  const ANNOUNCEMENTS_CHANNEL = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
  const ADMIN_USER_ID = process.env.DISCORD_ADMIN_PING_USER_ID ?? '857638016074907649'

  // Color coding per phase, applied to the activity-channel embed so
  // admins skimming the feed can immediately tell which phase a
  // completion came from. Announcements always use solid gold.
  const PHASE_COLORS: Record<number, number> = {
    1: 0x60a5fa,  // blue (Agent → Associate, onboarding)
    2: 0x4ade80,  // green (Associate → CFT, training)
    3: 0xC9A96E,  // gold (CFT → MD, advancement)
    4: 0xa78bfa,  // purple (MD → EMD, leadership)
    5: 0xf472b6,  // pink (EMD+, mastery)
  }
  const PHASE_TITLES: Record<number, string> = {
    1: 'Agent → Associate',
    2: 'Associate → CFT',
    3: 'CFT → Marketing Director',
    4: 'MD → Executive MD',
    5: 'Executive MD',
  }

  // ─── Uncheck path: retract any previously-posted celebratory message.
  // Idempotent (deleteChannelMessage swallows 404) so a double-uncheck
  // or a manual Discord delete won't break the toggle.
  if (isRealRetraction && process.env.DISCORD_BOT_TOKEN && (prior?.activityMsgId || prior?.announcementMsgId)) {
    try {
      const { deleteChannelMessage } = await import('@/lib/discord')
      if (prior?.activityMsgId) {
        try { await deleteChannelMessage(ACTIVITY_CHANNEL, prior.activityMsgId) } catch { /* non-fatal */ }
      }
      if (prior?.announcementMsgId) {
        try { await deleteChannelMessage(ANNOUNCEMENTS_CHANNEL, prior.announcementMsgId) } catch { /* non-fatal */ }
      }
      await db.phaseItem.update({
        where: { id: item.id },
        data: { activityMsgId: null, announcementMsgId: null },
      })
    } catch { /* non-fatal */ }
  }

  // ─── Completion path: post to the configured channels and remember
  // each message ID so the inverse flow above can find them on uncheck.
  if (isRealTransition && process.env.DISCORD_BOT_TOKEN) {
    try {
      const def = await db.phaseItemDefinition.findUnique({
        where: { itemKey },
        select: {
          label: true, postToActivity: true, pingAdmin: true, postToAnnouncements: true,
        },
      })
      const profile = await db.agentProfile.findUnique({
        where: { id: agentUser.profile.id },
        select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true },
      })

      if (def && profile && (def.postToActivity || def.postToAnnouncements)) {
        const agentName = `${profile.firstName} ${profile.lastName}`.trim()
        const { sendChannelMessage } = await import('@/lib/discord')
        let activityMsgId: string | null = null
        let announcementMsgId: string | null = null

        if (def.postToActivity) {
          // Per-phase color so the channel reads as a color-coded feed.
          // Admin pings override to bright gold so they stand out from
          // routine completions.
          const color = def.pingAdmin ? 0xFFD700 : (PHASE_COLORS[phase] ?? 0xC9A96E)
          const res = await sendChannelMessage(ACTIVITY_CHANNEL, {
            content: def.pingAdmin ? `<@${ADMIN_USER_ID}>` : undefined,
            embeds: [{
              description: `**${agentName}** completed *${def.label}*`,
              color,
              footer: { text: `Phase ${phase} · ${profile.agentCode}` },
              timestamp: new Date().toISOString(),
            }],
          })
          activityMsgId = res.id
        }

        if (def.postToAnnouncements) {
          // Grand celebratory layout for the public broadcast — uses the
          // shared achievement card factory so MILESTONE stays in lock-
          // step with PROMOTION / NEW RECRUIT / etc. visually.
          const { buildAchievementEmbed } = await import('@/lib/discord-card')
          const res = await sendChannelMessage(ANNOUNCEMENTS_CHANNEL, {
            embeds: [
              buildAchievementEmbed({
                flavor: 'MILESTONE',
                protagonist: {
                  firstName: profile.firstName,
                  lastName: profile.lastName,
                  agentCode: profile.agentCode,
                  avatarUrl: profile.avatarUrl,
                },
                subline: `Completed **${def.label}**`,
                fields: [
                  { name: 'Phase', value: PHASE_TITLES[phase] ?? `Phase ${phase}`, inline: true },
                  { name: 'Agent', value: '`' + profile.agentCode + '`',           inline: true },
                ],
              }),
            ],
          })
          announcementMsgId = res.id
        }

        if (activityMsgId || announcementMsgId) {
          await db.phaseItem.update({
            where: { id: item.id },
            data: { activityMsgId, announcementMsgId },
          })
        }
      }
    } catch { /* non-fatal — never block the toggle on a Discord outage */ }
  }

  if (isRealTransition && phase === agentUser.profile.phase && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const totalItems = PHASE_ITEMS[phase]?.length ?? 0
    const completedItems = await db.phaseItem.count({
      where: { agentProfileId: agentUser.profile.id, phase, completed: true },
    })

    if (totalItems > 0 && completedItems >= totalItems) {
      const PHASE_TITLES: Record<number, string> = {
        1: 'Agent → Associate', 2: 'Associate → CFT',
        3: 'CFT → Marketing Director', 4: 'MD → Executive MD',
      }
      const profile = await db.agentProfile.findUnique({
        where: { id: agentUser.profile.id },
        select: { firstName: true, lastName: true, agentCode: true, state: true },
      })
      if (profile) {
        try {
          const { sendChannelMessage } = await import('@/lib/discord')
          await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
            embeds: [{
              title: 'Ready for Promotion',
              description: [
                `**${profile.firstName} ${profile.lastName}** completed all Phase ${phase} items and is ready to advance.`,
                '',
                `Agent Code: \`${profile.agentCode}\``,
                `State: ${profile.state ?? 'Not set'}`,
                `Promotion: ${PHASE_TITLES[phase] ?? `Phase ${phase} → ${phase + 1}`}`,
              ].join('\n'),
              color: 0xC9A96E,
              footer: { text: 'AFF Concierge · Promotion Queue' },
              timestamp: new Date().toISOString(),
            }],
          })
        } catch { /* non-fatal */ }
      }
    }
  }

  return NextResponse.json(item)
}
