import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/agents/slot-fulfillment
// Body: { slotDefId }
// Marks a slot as completed. When the required number of slots are done,
// auto-completes the parent PhaseItem and fires Discord notifications.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = session.user!.email
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'No email in session' }, { status: 401 })
  }
  const agentUser = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true, phase: true } } },
  })
  if (!agentUser?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  const profile = agentUser.profile

  const body = await req.json() as { slotDefId: string }
  if (!body.slotDefId) return NextResponse.json({ error: 'slotDefId required' }, { status: 400 })

  const slotDef = await db.phaseItemSlotDef.findUnique({
    where: { id: body.slotDefId },
    include: {
      phaseItemDefinition: {
        select: { id: true, itemKey: true, phase: true, postToActivity: true, pingAdmin: true, postToAnnouncements: true, label: true, slotRequiredCount: true },
      },
    },
  })
  if (!slotDef) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  // Mark the slot complete (no linked record needed — just a completion flag)
  await db.agentSlotFulfillment.upsert({
    where: { slotDefId_agentProfileId: { slotDefId: body.slotDefId, agentProfileId: profile.id } },
    create: { slotDefId: body.slotDefId, agentProfileId: profile.id },
    update: { fulfilledAt: new Date() },
  })

  const def = slotDef.phaseItemDefinition
  const [totalSlots, filledSlots] = await Promise.all([
    db.phaseItemSlotDef.count({ where: { phaseItemDefinitionId: def.id } }),
    db.agentSlotFulfillment.count({
      where: { agentProfileId: profile.id, slotDef: { phaseItemDefinitionId: def.id } },
    }),
  ])

  const required = def.slotRequiredCount ?? totalSlots
  const allFilled = filledSlots >= required

  const prior = await db.phaseItem.findUnique({
    where: { agentProfileId_phase_itemKey: { agentProfileId: profile.id, phase: def.phase, itemKey: def.itemKey } },
    select: { completed: true, activityMsgId: true, announcementMsgId: true },
  })
  const wasCompleted = prior?.completed ?? false

  const phaseItem = await db.phaseItem.upsert({
    where: { agentProfileId_phase_itemKey: { agentProfileId: profile.id, phase: def.phase, itemKey: def.itemKey } },
    create: { agentProfileId: profile.id, phase: def.phase, itemKey: def.itemKey, completed: allFilled, completedAt: allFilled ? new Date() : null },
    update: { completed: allFilled, completedAt: allFilled ? new Date() : null },
  })

  const isRealTransition = allFilled && !wasCompleted

  if (isRealTransition && process.env.DISCORD_BOT_TOKEN) {
    try {
      const ACTIVITY_CHANNEL = process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID ?? '1501070249695383622'
      const ANNOUNCEMENTS_CHANNEL = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
      const ADMIN_USER_ID = process.env.DISCORD_ADMIN_PING_USER_ID ?? '857638016074907649'
      const PHASE_COLORS: Record<number, number> = { 1: 0x60a5fa, 2: 0x4ade80, 3: 0xC9A96E, 4: 0xa78bfa, 5: 0xf472b6 }

      const agentProfile = await db.agentProfile.findUnique({
        where: { id: profile.id },
        select: { firstName: true, lastName: true, preferredName: true, agentCode: true, avatarUrl: true },
      })

      if (agentProfile) {
        const { displayFullName } = await import('@/lib/display-name')
        const { sendChannelMessage } = await import('@/lib/discord')
        const agentName = displayFullName(agentProfile)
        let activityMsgId: string | null = null
        let announcementMsgId: string | null = null

        if (def.postToActivity) {
          const color = def.pingAdmin ? 0xFFD700 : (PHASE_COLORS[def.phase] ?? 0xC9A96E)
          const res = await sendChannelMessage(ACTIVITY_CHANNEL, {
            content: def.pingAdmin ? `<@${ADMIN_USER_ID}>` : undefined,
            embeds: [{ description: `**${agentName}** completed *${def.label}*`, color, footer: { text: `Phase ${def.phase} · ${agentProfile.agentCode}` }, timestamp: new Date().toISOString() }],
          })
          activityMsgId = res.id
        }

        if (def.postToAnnouncements) {
          const { buildAchievementEmbed } = await import('@/lib/discord-card')
          const res = await sendChannelMessage(ANNOUNCEMENTS_CHANNEL, {
            embeds: [buildAchievementEmbed({ flavor: 'MILESTONE', protagonist: { firstName: agentProfile.firstName, lastName: agentProfile.lastName, preferredName: agentProfile.preferredName, agentCode: agentProfile.agentCode, avatarUrl: agentProfile.avatarUrl }, subline: `Completed **${def.label}**`, fields: [{ name: 'Phase', value: `Phase ${def.phase}`, inline: true }, { name: 'Agent', value: '`' + agentProfile.agentCode + '`', inline: true }] })],
          })
          announcementMsgId = res.id
        }

        if (activityMsgId || announcementMsgId) {
          await db.phaseItem.update({ where: { id: phaseItem.id }, data: { activityMsgId, announcementMsgId } })
        }
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ completed: allFilled })
}

// DELETE /api/agents/slot-fulfillment?slotDefId=xxx
// Unchecks a slot and un-completes the parent item if needed.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = session.user!.email
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'No email in session' }, { status: 401 })
  }
  const agentUser = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!agentUser?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  const profile = agentUser.profile

  const slotDefId = new URL(req.url).searchParams.get('slotDefId')
  if (!slotDefId) return NextResponse.json({ error: 'slotDefId required' }, { status: 400 })

  const slotDef = await db.phaseItemSlotDef.findUnique({
    where: { id: slotDefId },
    include: { phaseItemDefinition: { select: { itemKey: true, phase: true } } },
  })
  if (!slotDef) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  await db.agentSlotFulfillment.deleteMany({ where: { slotDefId, agentProfileId: profile.id } })

  const def = slotDef.phaseItemDefinition
  const prior = await db.phaseItem.findUnique({
    where: { agentProfileId_phase_itemKey: { agentProfileId: profile.id, phase: def.phase, itemKey: def.itemKey } },
    select: { id: true, completed: true, activityMsgId: true, announcementMsgId: true },
  })

  if (prior?.completed) {
    await db.phaseItem.update({
      where: { id: prior.id },
      data: { completed: false, completedAt: null, activityMsgId: null, announcementMsgId: null },
    })
    if (process.env.DISCORD_BOT_TOKEN && (prior.activityMsgId || prior.announcementMsgId)) {
      try {
        const { deleteChannelMessage } = await import('@/lib/discord')
        const ACTIVITY_CHANNEL = process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID ?? '1501070249695383622'
        const ANNOUNCEMENTS_CHANNEL = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
        if (prior.activityMsgId) await deleteChannelMessage(ACTIVITY_CHANNEL, prior.activityMsgId).catch(() => {})
        if (prior.announcementMsgId) await deleteChannelMessage(ANNOUNCEMENTS_CHANNEL, prior.announcementMsgId).catch(() => {})
      } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json({ ok: true })
}
