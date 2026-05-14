import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  getAllTevahAgents,
  getAllTevahClients,
  tevahLevelToPhase,
  tevahProductToAffPolicyType,
  tevahStatusToAff,
  parseTevahClientName,
  TEVAH_STATE_MAP,
  type TevahAgent,
  type TevahClient,
} from '@/lib/tevah'
import { PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'
import { autoLinkBusinessPartnersForAgent } from '@/lib/business-partner-link'
import { notifySubmitted } from '@/lib/new-business-notifications'
import { recomputeClimbAchievements } from '@/lib/climb-points'
import { sendChannelMessage } from '@/lib/discord'
import { sendAgentInviteEmail } from '@/lib/send-agent-invite'
import type { PolicyType, NewBusinessStatus } from '@/generated/prisma/client'

// GET /api/cron/tevah-sync (Vercel cron, runs hourly)
// POST /api/cron/tevah-sync (called internally via /api/admin/tevah-sync)
//
// Two-phase sync from the Tevah supervision platform:
//
// Phase 1 — Agents: upserts all Tevah supervision records into AgentProfile.
//   Matching priority: (1) agentCode, (2) email, (3) phone.
//   New agents get phaseItems + carrierAppointments seeded, an invite email
//   sent automatically (if they have a real email), and climb milestones
//   recomputed so any already-earned badges are announced.
//
// Phase 2 — Submissions: upserts all Tevah client records into
//   NewBusinessSubmission using tevahClientId as the dedup key. Splits are
//   detected by grouping on policyNumber. New submissions created within the
//   last 48 hours fire the same Discord announcement as manual submissions
//   (no Tevah-specific note in the announcement).
//
// Ends with a summary embed to DISCORD_ADMIN_CHANNEL_ID.

const ANNOUNCE_WINDOW_MS = 48 * 60 * 60 * 1000

function isAuthorized(req: NextRequest): boolean {
  // Vercel cron: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  // Legacy manual/admin trigger: x-cron-secret header
  const secret = req.headers.get('x-cron-secret')
  if (secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentResults = await syncAgents()
  const clientResults = await syncClients()
  postSyncSummary(agentResults, clientResults).catch(() => {})
  return NextResponse.json({ ok: true, agents: agentResults, submissions: clientResults })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentResults = await syncAgents()
  const clientResults = await syncClients()
  postSyncSummary(agentResults, clientResults).catch(() => {})
  return NextResponse.json({ ok: true, agents: agentResults, submissions: clientResults })
}

async function postSyncSummary(
  agents: Awaited<ReturnType<typeof syncAgents>>,
  clients: Awaited<ReturnType<typeof syncClients>>,
) {
  const token = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  if (!token || !channelId) return

  if ('error' in agents && 'error' in clients) return

  const agentLines = 'error' in agents
    ? [`Agents: sync failed (${agents.error})`]
    : [
        `Agents: ${agents.created ?? 0} created, ${agents.updated ?? 0} updated, ${agents.pending ?? 0} pending Tevah code`,
        agents.invited ? `Invite emails sent: ${agents.invited}` : '',
        agents.created_codes?.length
          ? agents.created_names?.length
            ? `New: ${agents.created_codes.map((c, i) => `${agents.created_names![i] ?? ''} (${c})`).join(', ')}`
            : `New: ${agents.created_codes.join(', ')}`
          : '',
      ].filter(Boolean)

  const clientLines = 'error' in clients
    ? [`Submissions: sync failed (${clients.error})`]
    : [
        `Submissions: ${clients.created ?? 0} created, ${clients.updated ?? 0} updated, ${clients.announced ?? 0} announced`,
      ]

  await sendChannelMessage(channelId, {
    embeds: [{
      title: 'Tevah Sync Complete',
      description: [...agentLines, ...clientLines].join('\n'),
      color: 0x1a2744,
      timestamp: new Date().toISOString(),
      footer: { text: 'All Financial Freedom · Tevah Sync' },
    }],
  })
}

// ─── Phase 1: Agent sync ──────────────────────────────────────────────────────

export async function syncAgents() {
  let tevahAgents: TevahAgent[]
  try {
    tevahAgents = await getAllTevahAgents()
  } catch (err) {
    console.error('[tevah-sync/agents] fetch failed:', err)
    return { error: String(err) }
  }

  const agentsWithCode = tevahAgents.filter(a => a.code)
  const pendingCount = tevahAgents.length - agentsWithCode.length

  // Load all AFF profiles for matching.
  const existingProfiles = await db.agentProfile.findMany({
    select: { id: true, agentCode: true, agentUserId: true, phone: true },
    where: { status: { not: 'INACTIVE' } },
  })
  const existingByCode  = new Map(existingProfiles.map(p => [p.agentCode.toUpperCase(), p]))
  const existingByPhone = new Map(existingProfiles.filter(p => p.phone).map(p => [p.phone!.replace(/\D/g, ''), p]))

  // Load AgentUsers for email-based matching.
  const existingUsers = await db.agentUser.findMany({
    select: { id: true, email: true, profile: { select: { id: true, agentCode: true } } },
  })
  const existingUserByEmail = new Map(existingUsers.map(u => [u.email.toLowerCase(), u]))

  const results = {
    updated: 0, created: 0, skipped: 0, errors: 0, invited: 0,
    pending: pendingCount,
    created_codes: [] as string[],
    created_names: [] as string[],
    milestone_checks: 0,
  }

  for (const agent of agentsWithCode) {
    const code = agent.code!.toUpperCase()
    const email = agent.email?.toLowerCase().trim()
    const phone = agent.phone?.replace(/\D/g, '')

    try {
      // Matching priority: (1) agentCode, (2) email → linked profile, (3) phone
      let existing = existingByCode.get(code)
      if (!existing && email) {
        const userMatch = existingUserByEmail.get(email)
        if (userMatch?.profile) {
          existing = { id: userMatch.profile.id, agentCode: userMatch.profile.agentCode, agentUserId: userMatch.id, phone: null }
        }
      }
      if (!existing && phone) {
        existing = existingByPhone.get(phone)
      }

      if (existing) {
        await db.agentProfile.update({
          where: { id: existing.id },
          data: {
            // If the agentCode in AFF differs from Tevah (matched by email/phone), sync it.
            ...(existing.agentCode !== code ? { agentCode: code } : {}),
            ...(agent.npn           ? { npn:         agent.npn }            : {}),
            ...(agent.phone         ? { phone:       agent.phone }          : {}),
            ...(agent.dob           ? { dateOfBirth: new Date(agent.dob) }  : {}),
            ...(agent.reference     ? { recruiterId: agent.reference.toUpperCase() } : {}),
            ...(agent.stateId && TEVAH_STATE_MAP[agent.stateId]
                                    ? { state: TEVAH_STATE_MAP[agent.stateId] } : {}),
            ...(agent.address       ? { addressLine1: agent.address }       : {}),
            ...(agent.zipCode       ? { zip: agent.zipCode }                : {}),
            phase: tevahLevelToPhase(agent.level),
          },
        })
        // Recompute milestones so any newly matched submissions fire announcements.
        recomputeClimbAchievements(existing.id).catch(() => {})
        results.milestone_checks++
        results.updated++
      } else {
        // Create new agent in AFF.
        let agentUserId: string | undefined
        const existingUser = email ? existingUserByEmail.get(email) : undefined
        if (existingUser) {
          if (existingUser.profile) { results.skipped++; continue }
          agentUserId = existingUser.id
        }

        let newProfileId: string | null = null

        let newAgentUserId: string | undefined

        if (agentUserId) {
          const newProfile = await db.agentProfile.create({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { ...agentProfileData(agent, code), agentUser: { connect: { id: agentUserId } } } as any,
          })
          newProfileId = newProfile.id
          newAgentUserId = agentUserId
        } else {
          const finalEmail = email ?? `tevah-${agent.id}@aff.local`
          const agentUser = await db.agentUser.create({
            data: {
              email: finalEmail,
              inviteToken:   null,
              inviteExpires: null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              profile: { create: agentProfileData(agent, code) as any },
            },
            include: { profile: true },
          })
          newProfileId = agentUser.profile?.id ?? null
          newAgentUserId = agentUser.id
        }

        if (newProfileId) {
          if (email) await autoLinkBusinessPartnersForAgent({ agentProfileId: newProfileId, email })
          // Recompute climb so any already-synced submissions fire milestone badges.
          recomputeClimbAchievements(newProfileId).catch(() => {})
          results.milestone_checks++
        }

        // Send invite email for agents with real (non-placeholder) emails.
        if (newAgentUserId && email) {
          sendAgentInviteEmail(newAgentUserId).catch(() => {})
          results.invited++
        }

        results.created++
        results.created_codes.push(code)
        results.created_names.push(`${agent.firstName} ${agent.lastName}`.trim())
      }
    } catch (err) {
      console.error(`[tevah-sync/agents] error on ${code}:`, err)
      results.errors++
    }
  }

  return results
}

function agentProfileData(agent: TevahAgent, code: string) {
  const phase = tevahLevelToPhase(agent.level)
  const icaDate = agent.onboardApprovedDate
    ? new Date(agent.onboardApprovedDate)
    : new Date(agent.createdDate)

  return {
    agentCode: code,
    firstName: agent.firstName,
    lastName:  agent.lastName,
    ...(agent.npn       ? { npn:         agent.npn }           : {}),
    ...(agent.phone     ? { phone:       agent.phone }         : {}),
    ...(agent.dob       ? { dateOfBirth: new Date(agent.dob) } : {}),
    ...(agent.reference ? { recruiterId: agent.reference.toUpperCase() } : {}),
    ...(agent.stateId && TEVAH_STATE_MAP[agent.stateId]
                        ? { state: TEVAH_STATE_MAP[agent.stateId] } : {}),
    ...(agent.address   ? { addressLine1: agent.address }      : {}),
    ...(agent.zipCode   ? { zip:          agent.zipCode }      : {}),
    icaDate,
    phase,
    phaseStartedAt: new Date(),
    status: 'ACTIVE' as const,
    phaseItems: {
      create: PHASE_ITEMS[1].map((item: { key: string }) => ({
        phase: 1,
        itemKey: item.key,
        completed: false,
      })),
    },
    carrierAppointments: {
      create: CARRIERS.map((carrier: string) => ({
        carrier,
        status: 'NOT_STARTED',
      })),
    },
  }
}

// ─── Phase 2: Submission sync ─────────────────────────────────────────────────

export async function syncClients() {
  let clients: TevahClient[]
  try {
    clients = await getAllTevahClients()
  } catch (err) {
    console.error('[tevah-sync/clients] fetch failed:', err)
    return { error: String(err) }
  }

  const allProfiles = await db.agentProfile.findMany({
    select: { id: true, agentCode: true, firstName: true, lastName: true, discordUserId: true },
  })
  const profileByCode = new Map(allProfiles.map(p => [p.agentCode.toUpperCase(), p]))

  const existingSubs = await db.newBusinessSubmission.findMany({
    where: { tevahClientId: { not: null } },
    select: { id: true, tevahClientId: true, status: true, policyNumber: true },
  })
  const existingByTevahId = new Map(existingSubs.map(s => [s.tevahClientId!, s]))

  // Detect split pairs by grouping on policyNumber.
  const byPolicyNumber = new Map<string, TevahClient[]>()
  for (const c of clients) {
    if (c.policyNumber?.trim()) {
      const key = c.policyNumber.trim()
      const arr = byPolicyNumber.get(key) ?? []
      arr.push(c)
      byPolicyNumber.set(key, arr)
    }
  }

  const results = { created: 0, updated: 0, skipped: 0, errors: 0, announced: 0 }
  const now = Date.now()

  for (const client of clients) {
    try {
      const existing = existingByTevahId.get(client.id)
      const newStatus = tevahStatusToAff(client.status) as NewBusinessStatus

      if (existing) {
        if (existing.status !== newStatus || existing.policyNumber !== client.policyNumber) {
          await db.newBusinessSubmission.update({
            where: { tevahClientId: client.id },
            data: {
              status: newStatus,
              policyNumber: client.policyNumber ?? undefined,
              ...(newStatus === 'ISSUED' && client.policyIssueDate
                ? { issuedDate: new Date(client.policyIssueDate) }
                : {}),
            },
          })
          results.updated++
        } else {
          results.skipped++
        }
        continue
      }

      const writerCode = (client.writingAgentCode || '').toUpperCase()
      const writerProfile = profileByCode.get(writerCode)
      if (!writerProfile) {
        console.warn(`[tevah-sync/clients] no AFF profile for code ${writerCode} (tevahId ${client.id})`)
        results.skipped++
        continue
      }

      // Find split partner: same policyNumber, different writing agent code.
      let splitPartnerProfile: typeof writerProfile | undefined
      if (client.policyNumber) {
        const policyGroup = byPolicyNumber.get(client.policyNumber) ?? []
        const partnerRec = policyGroup.find(
          r => r.id !== client.id && r.writingAgentCode.toUpperCase() !== writerCode,
        )
        if (partnerRec) {
          splitPartnerProfile = profileByCode.get(partnerRec.writingAgentCode.toUpperCase())
        }
      }

      const { firstName: clientFirst, lastName: clientLast } = parseTevahClientName(client.clientName)
      const policyType = tevahProductToAffPolicyType(client.productType, client.insuranceType) as PolicyType
      const points = client.annualPremiumAmount
        ? parseFloat(client.annualPremiumAmount)
        : client.premiumAmount
          ? parseFloat(client.premiumAmount)
          : null
      const applicationDate = client.submitDate
        ? new Date(client.submitDate)
        : new Date(client.createdDate)

      await db.newBusinessSubmission.create({
        data: {
          agentProfileId:   writerProfile.id,
          splitWithAgentId: splitPartnerProfile?.id ?? null,
          clientFirstName:  clientFirst,
          clientLastName:   clientLast,
          clientPhone:      client.clientPhone ?? null,
          clientEmail:      client.clientEmail ?? null,
          carrier:          client.carrierDisplayName || client.carrierName,
          policyType,
          points,
          policyNumber:     client.policyNumber ?? null,
          status:           newStatus,
          applicationDate,
          ...(newStatus === 'ISSUED' && client.policyIssueDate
            ? { issuedDate: new Date(client.policyIssueDate) }
            : {}),
          tevahClientId: client.id,
        },
      })
      results.created++

      // Only announce submissions created recently so the first historical
      // bulk import doesn't flood Discord with hundreds of old submissions.
      const createdMs = new Date(client.createdDate).getTime()
      if (now - createdMs < ANNOUNCE_WINDOW_MS) {
        const agentName  = `${writerProfile.firstName} ${writerProfile.lastName}`.trim()
        const clientName = `${clientFirst} ${clientLast}`.trim()
        const splitWith  = splitPartnerProfile
          ? {
              firstName:    splitPartnerProfile.firstName,
              lastName:     splitPartnerProfile.lastName,
              agentCode:    splitPartnerProfile.agentCode,
              discordUserId: splitPartnerProfile.discordUserId,
            }
          : null

        notifySubmitted({
          agentName, policyType,
          carrier:    client.carrierDisplayName || client.carrierName,
          clientName, points, splitWith,
        }).catch(() => {})
        results.announced++
      }
    } catch (err) {
      console.error(`[tevah-sync/clients] error on tevahClientId ${client.id}:`, err)
      results.errors++
    }
  }

  return results
}
