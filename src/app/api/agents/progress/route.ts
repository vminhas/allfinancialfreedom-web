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
  // an already-100% phase has any item re-checked.
  const prior = await db.phaseItem.findUnique({
    where: {
      agentProfileId_phase_itemKey: {
        agentProfileId: agentUser.profile.id,
        phase,
        itemKey,
      },
    },
    select: { completed: true },
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

  // Only fire the "Ready for Promotion" notification on the genuine
  // transition: this item was previously not-complete, is now complete,
  // and the phase as a whole just hit 100%. Re-checking an item that was
  // already complete doesn't post a duplicate.
  const isRealTransition = completed && !wasCompleted
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
