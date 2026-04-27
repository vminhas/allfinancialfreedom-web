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
        await setSetting(`PREVIEW_TOKEN_${previewToken}`, '')
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
    agentUser = await db.agentUser.findUnique({
      where: { email: session.user!.email! },
      include: {
        profile: {
          include: {
            phaseItems: true,
            carrierAppointments: { orderBy: { carrier: 'asc' } },
            milestones: { orderBy: { completedAt: 'desc' } },
            _count: { select: { businessPartners: true, policies: true, callLogs: true } },
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

  // Phase progress for current and all phases
  const allPhaseProgress = [1, 2, 3, 4, 5].map(phase => {
    const total = PHASE_ITEMS[phase]?.length ?? 0
    const completed = p.phaseItems.filter(i => i.phase === phase && i.completed).length
    return { phase, total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
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
    milestones: p.milestones,
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
          phaseItems: true,
          carrierAppointments: { orderBy: { carrier: 'asc' } },
          milestones: { orderBy: { completedAt: 'desc' } },
          _count: { select: { businessPartners: true, policies: true, callLogs: true } },
        },
      },
    },
  })
}
