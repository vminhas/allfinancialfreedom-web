import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomUUID, randomBytes } from 'crypto'
import { PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'
import { autoLinkBusinessPartnersForAgent } from '@/lib/business-partner-link'

// GET /api/admin/agents — list all agents with phase progress
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const phase      = searchParams.get('phase')
  const status     = searchParams.get('status')
  const cft        = searchParams.get('cft')
  const icaStart   = searchParams.get('icaStart')
  const icaEnd     = searchParams.get('icaEnd')
  const atRisk     = searchParams.get('atRisk') === '1'
  const readyToPromote = searchParams.get('readyToPromote') === '1'
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const skip  = (page - 1) * limit

  const search = searchParams.get('search')
  const recruiter = searchParams.get('recruiter')

  // Special mode: return the list of unique recruiters for the filter dropdown
  if (searchParams.get('recruiters') === '1') {
    const rows = await db.agentProfile.findMany({
      where: { recruiterId: { not: null }, isTest: false },
      select: { recruiterId: true },
      distinct: ['recruiterId'],
    })
    const codes = rows.map(r => r.recruiterId).filter(Boolean) as string[]
    const rProfiles = codes.length > 0
      ? await db.agentProfile.findMany({
          where: { agentCode: { in: codes } },
          select: { agentCode: true, firstName: true, lastName: true },
        })
      : []
    return NextResponse.json({
      recruiters: rProfiles
        .map(p => ({ agentCode: p.agentCode, name: `${p.firstName} ${p.lastName}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  }

  const where: Record<string, unknown> = {}
  if (phase)     where.phase     = parseInt(phase)
  if (status)    where.status    = status.toUpperCase()
  if (cft)       where.cft       = cft
  if (recruiter) where.recruiterId = recruiter
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { agentCode: { contains: search, mode: 'insensitive' } },
      { agentUser: { email: { contains: search, mode: 'insensitive' } } },
    ]
  }
  if (icaStart || icaEnd) {
    const icaFilter: Record<string, Date> = {}
    if (icaStart && !isNaN(Date.parse(icaStart))) icaFilter.gte = new Date(icaStart)
    if (icaEnd && !isNaN(Date.parse(icaEnd)))     icaFilter.lte = new Date(icaEnd + 'T23:59:59')
    if (Object.keys(icaFilter).length > 0) where.icaDate = icaFilter
  }
  // atRisk filter is applied post-query (requires computed fields)
  void atRisk

  const [profiles, total] = await Promise.all([
    db.agentProfile.findMany({
      where,
      ...(readyToPromote ? {} : { skip, take: limit }),
      orderBy: { createdAt: 'desc' },
      include: {
        agentUser: { select: { email: true, lastLoginAt: true } },
        phaseItems: { select: { phase: true, completed: true } },
        carrierAppointments: { select: { status: true } },
        _count: { select: { milestones: true } },
      },
    }),
    db.agentProfile.count({ where }),
  ])

  // Fetch recruiter display names for the profiles in this page
  const recruiterCodes = [...new Set(profiles.map(p => p.recruiterId).filter(Boolean))] as string[]
  const recruiterProfiles = recruiterCodes.length > 0
    ? await db.agentProfile.findMany({
        where: { agentCode: { in: recruiterCodes } },
        select: { agentCode: true, firstName: true, lastName: true },
      })
    : []
  const recruiterNameMap = new Map(recruiterProfiles.map(r => [r.agentCode, `${r.firstName} ${r.lastName}`]))

  // Pull 30-day call review aggregates for all profiles in one query
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentReviews = await db.callReview.findMany({
    where: {
      agentProfileId: { in: profiles.map(p => p.id) },
      reviewedAt: { gte: thirtyDaysAgo },
    },
    select: { agentProfileId: true, overallScore: true, flaggedForCoaching: true, discussedAt: true },
  })
  const reviewAggByAgent = new Map<string, { sum: number; count: number; flagged: number }>()
  for (const r of recentReviews) {
    const a = reviewAggByAgent.get(r.agentProfileId) ?? { sum: 0, count: 0, flagged: 0 }
    a.sum += r.overallScore
    a.count += 1
    if (r.flaggedForCoaching && !r.discussedAt) a.flagged += 1
    reviewAggByAgent.set(r.agentProfileId, a)
  }

  const agents = profiles.map(p => {
    const phaseTotal = PHASE_ITEMS[p.phase]?.length ?? 0
    const phaseCompleted = p.phaseItems.filter(
      i => i.phase === p.phase && i.completed
    ).length
    const appointed = p.carrierAppointments.filter(c => c.status === 'APPOINTED').length
    const agg = reviewAggByAgent.get(p.id)

    const readyForPromotion = p.phase < 5 && phaseTotal > 0 && phaseCompleted >= phaseTotal

    return {
      id: p.id,
      agentCode: p.agentCode,
      firstName: p.firstName,
      lastName: p.lastName,
      avatarUrl: p.avatarUrl,
      state: p.state,
      phase: p.phase,
      phaseStartedAt: p.phaseStartedAt,
      status: p.status,
      goal: p.goal,
      cft: p.cft,
      email: p.agentUser.email,
      lastLoginAt: p.agentUser.lastLoginAt,
      icaDate: p.icaDate,
      phaseCompleted,
      phaseTotal,
      readyForPromotion,
      carriersAppointed: appointed,
      carriersTotal: CARRIERS.length,
      milestoneCount: p._count.milestones,
      createdAt: p.createdAt,
      callScore30d: agg && agg.count > 0 ? Math.round(agg.sum / agg.count) : null,
      callReviewCount30d: agg?.count ?? 0,
      openCoachingFlags: agg?.flagged ?? 0,
      phone: p.phone,
      recruiterCode: p.recruiterId ?? null,
      recruiterName: p.recruiterId ? (recruiterNameMap.get(p.recruiterId) ?? null) : null,
    }
  })

  if (readyToPromote) {
    const filtered = agents.filter(a => a.readyForPromotion)
    return NextResponse.json({ agents: filtered, total: filtered.length, page: 1, limit: filtered.length })
  }

  return NextResponse.json({ agents, total, page, limit })
}

// POST /api/admin/agents — create new agent + AgentUser + seed items
// Both admins and licensing coordinators can create agents (LC onboards them)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    firstName: string
    lastName: string
    email: string
    agentCode: string
    state?: string
    phone?: string
    icaDate?: string
    recruiterId?: string
    cft?: string
    goal?: string
    initialPointOfContact?: string
    // Tracking-only mode: creates the AgentProfile as INACTIVE for
    // historical/downline visibility without seeding onboarding,
    // sending an invite, or pinging Discord. For ex-agents who left
    // before the portal existed (or whose original record was lost)
    // and need to appear in someone's downline view.
    trackingOnly?: boolean
  }

  // Email is required only for real agents. Tracking-only mode
  // auto-generates a placeholder so the unique constraint is still
  // honored. The .local TLD is reserved + non-routable, so a typo
  // can never resolve to a real inbox.
  if (!body.firstName || !body.lastName || !body.agentCode) {
    return NextResponse.json({ error: 'firstName, lastName, agentCode required' }, { status: 400 })
  }
  if (!body.trackingOnly && !body.email) {
    return NextResponse.json({ error: 'email required (or check Tracking only)' }, { status: 400 })
  }

  const trackingOnly = body.trackingOnly === true

  const finalEmail = body.email && body.email.trim()
    ? body.email.toLowerCase().trim()
    : `alumni-${randomBytes(3).toString('hex')}@aff.local`

  const inviteToken = trackingOnly ? null : randomUUID()
  const inviteExpires = trackingOnly ? null : new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours

  try {
    const agentUser = await db.agentUser.create({
      data: {
        email: finalEmail,
        inviteToken,
        inviteExpires,
        profile: {
          create: {
            agentCode: body.agentCode.toUpperCase(),
            firstName: body.firstName,
            lastName: body.lastName,
            state: body.state,
            phone: body.phone,
            icaDate: body.icaDate ? new Date(body.icaDate) : null,
            recruiterId: body.recruiterId,
            cft: body.cft,
            goal: body.goal,
            initialPointOfContact: body.initialPointOfContact,
            phase: 1,
            phaseStartedAt: new Date(),
            // Tracking-only profiles ship in as INACTIVE so they're
            // excluded from leaderboards / progression-matrix /
            // active-agent counts automatically. Real agents start
            // ACTIVE (the schema default).
            status: trackingOnly ? 'INACTIVE' : 'ACTIVE',
            // Skip onboarding seed for tracking-only profiles —
            // the items are irrelevant for someone who already left
            // and just pollute the matrix view.
            ...(trackingOnly ? {} : {
              phaseItems: {
                create: PHASE_ITEMS[1].map(item => ({
                  phase: 1,
                  itemKey: item.key,
                  completed: false,
                })),
              },
              carrierAppointments: {
                create: CARRIERS.map(carrier => ({
                  carrier,
                  status: 'NOT_STARTED',
                })),
              },
            }),
          },
        },
      },
      include: { profile: true },
    })

    // Eager-link any BusinessPartner contact rows (across all recruiters'
    // lists) whose email matches this new agent. The recruiter's BP card
    // for this person can then surface the new agent's NPN / license
    // automatically once they fill those fields in on their own profile.
    // Skipped for tracking-only profiles — they have a synthetic email
    // that won't match any BP contact's real email.
    if (!trackingOnly && agentUser.profile) {
      await autoLinkBusinessPartnersForAgent({
        agentProfileId: agentUser.profile.id,
        email: agentUser.email,
      })
    }

    // Best-effort admin-channel ping so the team has visibility into
    // every new agent account, regardless of which path created it.
    // Activation pings live in /api/agents/set-password; this is the
    // create-side event. Skipped for tracking-only profiles since this
    // isn't a real new teammate.
    if (!trackingOnly && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
      try {
        const { sendChannelMessage } = await import('@/lib/discord')
        const creatorEmail = (session?.user as { email?: string } | undefined)?.email ?? 'admin'
        await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
          embeds: [{
            title: 'New Agent Account Created',
            description: [
              `**${body.firstName} ${body.lastName}** was added to the agent roster.`,
              '',
              `Agent Code: \`${body.agentCode.toUpperCase()}\``,
              `Email: ${body.email.toLowerCase()}`,
              body.state ? `State: ${body.state}` : '',
              `Created by: ${creatorEmail}`,
              '',
              '_Pending invite acceptance. Account activates when they set their password._',
            ].filter(Boolean).join('\n'),
            color: 0x60A5FA,
            footer: { text: 'AFF Concierge · Account audit' },
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => {})
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      ok: true,
      agentUserId: agentUser.id,
      profileId: agentUser.profile?.id,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Email or agent code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
