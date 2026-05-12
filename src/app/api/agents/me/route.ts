import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt, getSetting, setSetting } from '@/lib/settings'
import { getAgentDiscordRoleName } from '@/lib/discord-roles'
import { PHASE_LABELS, PHASE_ITEMS } from '@/lib/agent-constants'

export async function GET(req: NextRequest) {
  // Check for admin preview token first
  const previewToken = new URL(req.url).searchParams.get('preview')
  let agentUser: Awaited<ReturnType<typeof findAgentUser>> | null = null

  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        // Don't consume the token here — the agents page makes multiple
        // sub-fetches (/team, /referrals, /coordinator-requests, etc.) that
        // all need to validate the same preview token. Time-based expiry
        // (5 min, set when the token was issued) is the only auth boundary.
        const profile = await db.agentProfile.findUnique({
          where: { id: data.agentProfileId },
          select: { agentUserId: true },
        })
        if (profile) {
          agentUser = await findAgentUser(profile.agentUserId)
        }
      }
    }
  }

  if (!agentUser) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user as { role?: string }).role !== 'agent') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const email = session.user!.email
    if (typeof email !== 'string' || email.trim().length === 0) {
      return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
    }
    agentUser = await db.agentUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: {
        profile: {
          include: {
            // include the linked recruit relation so direct_N items
            // can render "Linked to: Sarah Johnson" without a second
            // round-trip per item.
            phaseItems: {
              include: {
                linkedAgentProfile: {
                  select: { id: true, firstName: true, lastName: true, agentCode: true, status: true, avatarUrl: true },
                },
              },
            },
            carrierAppointments: { orderBy: { carrier: 'asc' } },
            milestones: { orderBy: { completedAt: 'desc' } },
            _count: { select: { businessPartners: true, callLogs: true } },
            // Completed FTAs in chronological order so the agent
            // dashboard can zip them onto the fta_N checklist items
            // ("Field Training 2 with David Kubicka" instead of just
            // "Field Training 2").
            ftas: {
              where: { status: 'COMPLETED' },
              orderBy: { completedAt: 'asc' },
              select: {
                id: true,
                name: true,
                appointmentDate: true,
                completedAt: true,
                notes: true,
                businessPartner: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })
  }

  if (!agentUser?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (agentUser.profile.status === 'INACTIVE') {
    return NextResponse.json({ error: 'AccountInactive' }, { status: 403 })
  }

  const p = agentUser.profile

  // Self-heal: agents who connected Discord before the discord-callback
  // route started persisting the `connect_discord` PhaseItem (e.g. Sadie)
  // have `discordUserId` set but no completion row, so they show as
  // not-done on the leaderboard / progression matrix. Catch up on their
  // next dashboard load. Idempotent — runs at most once per agent.
  if (p.discordUserId && !p.phaseItems.some(i => i.itemKey === 'connect_discord' && i.completed)) {
    const now = new Date()
    await db.phaseItem.upsert({
      where: {
        agentProfileId_phase_itemKey: {
          agentProfileId: p.id,
          phase: 1,
          itemKey: 'connect_discord',
        },
      },
      update: { completed: true, completedAt: now },
      create: {
        agentProfileId: p.id,
        phase: 1,
        itemKey: 'connect_discord',
        completed: true,
        completedAt: now,
      },
    })
    // Reflect into the in-memory copy so this request's progress math
    // doesn't undercount by one. Replace the existing row if any, else
    // append.
    const existingIdx = p.phaseItems.findIndex(i => i.itemKey === 'connect_discord')
    const healed = {
      ...(existingIdx >= 0 ? p.phaseItems[existingIdx] : {
        id: 'pending', agentProfileId: p.id, phase: 1, itemKey: 'connect_discord',
        activityMsgId: null, announcementMsgId: null,
        linkedAgentProfileId: null, linkedAgentProfile: null,
      }),
      completed: true,
      completedAt: now,
    } as typeof p.phaseItems[number]
    if (existingIdx >= 0) p.phaseItems[existingIdx] = healed
    else p.phaseItems.push(healed)
  }

  // Phase progress for current and all phases.
  //
  // We resolve the live definition set from PhaseItemDefinition (the
  // editor's source of truth) rather than the bundled PHASE_ITEMS
  // constants. Agents reported 20/18 (111%) on Phase 2 because the
  // total used the constants but the completed count walked every
  // PhaseItem row, including stale ones whose itemKey was removed or
  // renamed in the editor. Only count completions whose itemKey is
  // still in the current definition set; the math now matches "what
  // the checklist actually shows."
  const allDefs = await db.phaseItemDefinition.findMany({
    select: { phase: true, itemKey: true },
  })
  const liveKeysByPhase: Record<number, Set<string>> = {}
  const totalByPhase: Record<number, number> = {}
  for (const d of allDefs) {
    if (!liveKeysByPhase[d.phase]) {
      liveKeysByPhase[d.phase] = new Set()
      totalByPhase[d.phase] = 0
    }
    liveKeysByPhase[d.phase].add(d.itemKey)
    totalByPhase[d.phase] += 1
  }

  const allPhaseProgress = [1, 2, 3, 4, 5, 6].map(phase => {
    // Fall back to PHASE_ITEMS only if the editor hasn't seeded any
    // definitions yet (fresh-DB / dev-environment safety).
    const liveKeys = liveKeysByPhase[phase]
    const fellBack = !liveKeys
    const total = fellBack ? (PHASE_ITEMS[phase]?.length ?? 0) : (totalByPhase[phase] ?? 0)
    const completed = p.phaseItems.filter(i =>
      i.phase === phase && i.completed && (fellBack || liveKeys!.has(i.itemKey))
    ).length
    // Belt-and-braces clamp so an off-by-one in either direction
    // never blows up the UI bar width.
    const safeCompleted = Math.min(completed, total)
    return {
      phase,
      total,
      completed: safeCompleted,
      pct: total > 0 ? Math.round((safeCompleted / total) * 100) : 0,
    }
  })

  const discordRoleName = await getAgentDiscordRoleName(p.phase).catch(() => null)

  // Mask SSN — decrypt server-side, return only last 4 digits to agent
  let ssnMasked: string | null = null
  let ssnOnFile = false
  if (p.ssn) {
    ssnOnFile = true
    const plain = decrypt(p.ssn)
    ssnMasked = plain.length === 9 ? `***-**-${plain.slice(-4)}` : '***-**-****'
  }

  const justPromoted = p.lastSeenPhase !== null && p.lastSeenPhase < p.phase

  if (p.lastSeenPhase !== p.phase) {
    db.agentProfile.update({
      where: { id: p.id },
      data: { lastSeenPhase: p.phase },
    }).catch(() => {})
  }

  return NextResponse.json({
    id: p.id,
    agentCode: p.agentCode,
    firstName: p.firstName,
    lastName: p.lastName,
    // Earned recognitions (e.g. 'CFT'). Drives feature gates on the
    // agent portal — the AI call analyzer is locked until CFT.
    badges: p.badges ?? [],
    state: p.state,
    phone: p.phone,
    dateOfBirth: p.dateOfBirth,
    avatarUrl: p.avatarUrl,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    zip: p.zip,
    country: p.country,
    ssnMasked,
    ssnOnFile,
    email: agentUser.email,
    phase: p.phase,
    phaseLabel: PHASE_LABELS[p.phase],
    phaseStartedAt: p.phaseStartedAt,
    status: p.status,
    goal: p.goal,
    cft: p.cft,
    discordUserId: p.discordUserId,
    discordRoleName,
    icaDate: p.icaDate,
    licenseNumber: p.licenseNumber,
    examDate: p.examDate,
    npn: p.npn,
    calendlyUrl: p.calendlyUrl,
    allPhaseProgress,
    phaseItems: p.phaseItems,
    carrierAppointments: p.carrierAppointments,
    selectedCarriers: p.selectedCarriers,
    milestones: p.milestones,
    completedFtas: p.ftas,
    counts: p._count,
    justPromoted,
  })
}

function findAgentUser(agentUserId: string) {
  return db.agentUser.findUnique({
    where: { id: agentUserId },
    include: {
      profile: {
        include: {
          phaseItems: {
            include: {
              linkedAgentProfile: {
                select: { id: true, firstName: true, lastName: true, agentCode: true, status: true, avatarUrl: true },
              },
            },
          },
          carrierAppointments: { orderBy: { carrier: 'asc' } },
          milestones: { orderBy: { completedAt: 'desc' } },
          _count: { select: { businessPartners: true, callLogs: true } },
          ftas: {
            where: { status: 'COMPLETED' },
            orderBy: { completedAt: 'asc' },
            select: {
              id: true,
              name: true,
              appointmentDate: true,
              completedAt: true,
              businessPartner: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })
}
