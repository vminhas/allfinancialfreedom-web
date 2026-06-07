import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHASE_ITEMS } from '@/lib/agent-constants'
import { requireRole } from '@/lib/permissions'
import { recomputeBadges, CFT_GATE_ITEM_KEYS } from '@/lib/agent-badges'

// PUT /api/admin/agents/[id]/progress — admin toggles a phase item on behalf of an agent
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params

  const { itemKey, phase, completed } = await req.json() as {
    itemKey: string
    phase: number
    completed: boolean
  }

  if (!itemKey || !phase) {
    return NextResponse.json({ error: 'itemKey and phase required' }, { status: 400 })
  }

  const dbDef = await db.phaseItemDefinition.findUnique({ where: { itemKey }, select: { phase: true } })
  const validKeys = PHASE_ITEMS[phase]?.map(i => i.key) ?? []
  if (!dbDef && !validKeys.includes(itemKey)) {
    return NextResponse.json({ error: 'Invalid item key for this phase' }, { status: 400 })
  }
  if (dbDef && dbDef.phase !== phase) {
    return NextResponse.json({ error: 'Item belongs to a different phase' }, { status: 400 })
  }

  // Verify agent exists
  const profile = await db.agentProfile.findUnique({ where: { id }, select: { id: true } })
  if (!profile) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Snapshot the prior state so we can decide whether to fire the
  // Discord announcement. We only announce on a false→true transition
  // (or the first time the row is being created with completed=true)
  // and only when no announcementMsgId has been stored yet, so admin
  // re-saves never double-post.
  const prior = await db.phaseItem.findUnique({
    where: {
      agentProfileId_phase_itemKey: { agentProfileId: id, phase, itemKey },
    },
    select: { completed: true, announcementMsgId: true, activityMsgId: true },
  })

  const item = await db.phaseItem.upsert({
    where: {
      agentProfileId_phase_itemKey: {
        agentProfileId: id,
        phase,
        itemKey,
      },
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
    },
    create: {
      agentProfileId: id,
      phase,
      itemKey,
      completed,
      completedAt: completed ? new Date() : null,
    },
  })

  // Retraction path: an admin unticking the box deletes any prior
  // celebratory Discord posts and clears the stored message IDs.
  // Mirrors the agent-self path (src/app/api/agents/progress/route.ts)
  // so the admin tracker drawer is a true superset, not a one-way door.
  // Clearing the IDs is also what makes re-tick reliably resend: the
  // shouldAnnounce guard below requires both IDs to be null.
  const isRealRetraction = !completed && (prior?.completed ?? false)
  if (isRealRetraction && process.env.DISCORD_BOT_TOKEN && (prior?.activityMsgId || prior?.announcementMsgId)) {
    const ACTIVITY_CHANNEL = process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID ?? '1501070249695383622'
    const ANNOUNCEMENTS_CHANNEL = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
    try {
      const { deleteChannelMessage } = await import('@/lib/discord')
      if (prior?.activityMsgId) {
        await deleteChannelMessage(ACTIVITY_CHANNEL, prior.activityMsgId).catch(() => {})
      }
      if (prior?.announcementMsgId) {
        await deleteChannelMessage(ANNOUNCEMENTS_CHANNEL, prior.announcementMsgId).catch(() => {})
      }
    } catch { /* non-fatal */ }
    await db.phaseItem.update({
      where: { id: item.id },
      data: { activityMsgId: null, announcementMsgId: null },
    }).catch(() => {})
  }

  // Fire the Discord celebration if this toggle just flipped the item
  // to completed and we haven't announced before. Same helper the
  // agent-self path and the promotion-request approval path use, so
  // an admin ticking the box from /vault/progress posts the identical
  // embed to #announcements / #activity.
  const shouldAnnounce =
    completed &&
    (!prior?.completed) &&
    !prior?.announcementMsgId &&
    !prior?.activityMsgId
  if (shouldAnnounce) {
    const { announcePhaseItemCompletion } = await import('@/lib/phase-item-announce')
    const ids = await announcePhaseItemCompletion({
      agentProfileId: id,
      itemKey,
      phase,
    }).catch(() => ({ activityMsgId: null, announcementMsgId: null }))
    if (ids.activityMsgId || ids.announcementMsgId) {
      await db.phaseItem.update({
        where: {
          agentProfileId_phase_itemKey: { agentProfileId: id, phase, itemKey },
        },
        data: {
          activityMsgId: ids.activityMsgId,
          announcementMsgId: ids.announcementMsgId,
        },
      }).catch(() => {})
    }
  }

  // If the toggled item is one of the four CFT-gating signoffs,
  // recompute auto-managed badges so the CFT chip lights up the
  // moment the last signoff lands (and turns off if any signoff is
  // unchecked later). Non-blocking: a recompute failure shouldn't
  // unwind the toggle the admin just made.
  if ((CFT_GATE_ITEM_KEYS as unknown as string[]).includes(itemKey) && phase === 3) {
    recomputeBadges(id).catch(err =>
      console.warn('[progress PUT] recomputeBadges failed:', err),
    )
  }

  return NextResponse.json(item)
}
