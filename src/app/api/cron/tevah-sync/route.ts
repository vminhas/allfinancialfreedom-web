import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  getAllTevahAgents,
  getAllTevahClients,
  getAllTevahAgentPoints,
  getAllTevahAgentRecruits,
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
import { logSubmissionActivity } from '@/lib/submission-activity'
import { recomputeClimbAchievements } from '@/lib/climb-points'
import { getAutoAssignee } from '@/lib/auto-assign'
import { sendChannelMessage } from '@/lib/discord'
import { sendAgentInviteEmail } from '@/lib/send-agent-invite'
import { celebrateNewBusinessPartner } from '@/lib/celebrate-new-business-partner'
import { getSetting } from '@/lib/settings'
import { autoAdvanceContactOnAgentCreation } from '@/lib/ghl-pipeline'
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
  syncTevahPoints().catch(() => {})
  syncTevahRecruits().catch(() => {})
  postSyncSummary().catch(err => console.warn('[tevah-sync] digest post failed:', err))
  return NextResponse.json({ ok: true, agents: agentResults, submissions: clientResults })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentResults = await syncAgents()
  const clientResults = await syncClients()
  syncTevahPoints().catch(() => {})
  syncTevahRecruits().catch(() => {})
  postSyncSummary().catch(err => console.warn('[tevah-sync] digest post failed:', err))
  return NextResponse.json({ ok: true, agents: agentResults, submissions: clientResults })
}

// Daily digest hour in UTC. Matches the other "daily" crons in
// vercel.json (daily-outreach, agent-reminders, birthday-greetings,
// renewal-digest, client-reminders all fire at 13:00 UTC = 9am ET).
// Picking the same hour means all admin-facing summaries land in one
// batch so Vick reads one Discord burst per morning instead of a
// drumbeat throughout the day.
const TEVAH_DIGEST_HOUR_UTC = 13

async function postSyncSummary() {
  // The sync itself still runs hourly (it's the data pipeline that
  // keeps the leaderboard fresh and feeds per-event Discord
  // celebrations elsewhere). The summary embed only fires once per
  // day so admins get a real digest instead of 24 micro-updates.
  if (new Date().getUTCHours() !== TEVAH_DIGEST_HOUR_UTC) return

  const token = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  if (!token || !channelId) return

  // Past 24 hours of Tevah-sourced activity, queried from the DB so
  // the digest reflects everything that landed today (not just the
  // current cron run's deltas).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [newAgents, newSubsCount] = await Promise.all([
    db.agentProfile.findMany({
      where: { createdAt: { gte: since }, tevahAgentId: { not: null } },
      select: { agentCode: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.newBusinessSubmission.count({
      where: { createdAt: { gte: since }, tevahClientId: { not: null } },
    }),
  ])

  if (newAgents.length === 0 && newSubsCount === 0) return

  const MAX_NAMES = 20
  const names = newAgents.map(a => `${a.firstName ?? ''} ${a.lastName ?? ''} (${a.agentCode})`.trim())
  const nameList = names.length > MAX_NAMES
    ? names.slice(0, MAX_NAMES).join(', ') + ` + ${names.length - MAX_NAMES} more`
    : names.join(', ')

  const lines: string[] = []
  if (newAgents.length > 0) {
    lines.push(`Agents: ${newAgents.length} new in the last 24 hours`)
    if (nameList) lines.push(`New: ${nameList}`)
  }
  if (newSubsCount > 0) {
    lines.push(`Submissions: ${newSubsCount} new in the last 24 hours`)
  }

  await sendChannelMessage(channelId, {
    embeds: [{
      title: 'Tevah Daily Digest',
      description: lines.join('\n'),
      color: 0x1a2744,
      timestamp: new Date().toISOString(),
      footer: { text: 'All Financial Freedom · Tevah Daily Digest' },
    }],
  })
}

// Phase 3: Sync Tevah all-time points onto AgentProfile.tevahPoints.
// Runs fire-and-forget after the main sync so a points-fetch failure
// never blocks agent/submission processing.
async function syncTevahPoints() {
  let pointsMap: Map<string, number>
  try {
    pointsMap = await getAllTevahAgentPoints()
  } catch (err) {
    console.error('[tevah-sync/points] fetch failed:', err)
    return
  }

  const profiles = await db.agentProfile.findMany({
    where: { agentCode: { in: [...pointsMap.keys()] } },
    select: { id: true, agentCode: true },
  })

  await Promise.all(
    profiles.map(p => {
      const pts = pointsMap.get(p.agentCode.toUpperCase())
      if (pts === undefined) return Promise.resolve()
      return db.agentProfile.update({
        where: { id: p.id },
        data: { tevahPoints: pts },
      })
    })
  )
}

// Phase 4: Sync current-month Tevah recruit counts onto AgentProfile.
// Runs fire-and-forget so a failure never blocks agent/submission processing.
async function syncTevahRecruits() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthLabel = `${year}-${String(month).padStart(2, '0')}`

  let recruitsMap: Map<string, number>
  try {
    recruitsMap = await getAllTevahAgentRecruits(year, month)
  } catch (err) {
    console.error('[tevah-sync/recruits] fetch failed:', err)
    return
  }

  console.log(`[tevah-sync/recruits] fetched ${recruitsMap.size} agents with recruits for ${monthLabel}`)

  const profiles = await db.agentProfile.findMany({
    where: { agentCode: { in: [...recruitsMap.keys()] } },
    select: { id: true, agentCode: true },
  })

  console.log(`[tevah-sync/recruits] matched ${profiles.length} local profiles`)

  let updated = 0
  await Promise.all(
    profiles.map(async p => {
      const count = recruitsMap.get(p.agentCode.toUpperCase())
      if (count === undefined) return
      try {
        await db.agentProfile.update({
          where: { id: p.id },
          data: { tevahMonthlyRecruits: count, tevahRecruitsMonth: monthLabel },
        })
        updated++
      } catch (err) {
        console.error(`[tevah-sync/recruits] update failed for ${p.agentCode}:`, err)
      }
    })
  )

  console.log(`[tevah-sync/recruits] updated ${updated} profiles`)
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
    select: { id: true, agentCode: true, agentUserId: true, phone: true, recruiterId: true, npn: true, dateOfBirth: true, state: true, addressLine1: true, zip: true },
    where: { status: { not: 'INACTIVE' } },
  })
  const existingByCode  = new Map(existingProfiles.map(p => [p.agentCode.toUpperCase(), p]))
  const existingByPhone = new Map(existingProfiles.filter(p => p.phone).map(p => [p.phone!.replace(/\D/g, ''), p]))

  // Load AgentUsers for email-based matching.
  const existingUsers = await db.agentUser.findMany({
    select: { id: true, email: true, profile: { select: { id: true, agentCode: true, recruiterId: true, npn: true, dateOfBirth: true, state: true, addressLine1: true, zip: true, phone: true } } },
  })
  const existingUserByEmail = new Map(existingUsers.map(u => [u.email.toLowerCase(), u]))

  const results = {
    updated: 0, created: 0, skipped: 0, errors: 0, invited: 0,
    pending: pendingCount,
    created_codes: [] as string[],
    created_names: [] as string[],
    milestone_checks: 0,
    // How many of the created-this-sync agents got a public NEW BUSINESS
    // PARTNER card posted to #announcements. Less than `created` is
    // expected when an agent has no recruiterId on file (self-onboarded
    // via the public site, or Tevah didn't ship a reference field).
    announced: 0,
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
          existing = { id: userMatch.profile.id, agentCode: userMatch.profile.agentCode, agentUserId: userMatch.id, phone: userMatch.profile.phone, recruiterId: userMatch.profile.recruiterId, npn: userMatch.profile.npn, dateOfBirth: userMatch.profile.dateOfBirth, state: userMatch.profile.state, addressLine1: userMatch.profile.addressLine1, zip: userMatch.profile.zip }
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
            tevahAgentId: agent.id,
            ...(agent.npn           && !existing.npn         ? { npn:         agent.npn }            : {}),
            ...(agent.phone         && !existing.phone       ? { phone:       agent.phone }          : {}),
            ...(agent.dob           && !existing.dateOfBirth ? { dateOfBirth: new Date(agent.dob) }  : {}),
            ...(agent.reference     && !existing.recruiterId ? { recruiterId: agent.reference.toUpperCase() } : {}),
            ...(agent.stateId && TEVAH_STATE_MAP[agent.stateId] && !existing.state
                                    ? { state: TEVAH_STATE_MAP[agent.stateId] } : {}),
            ...(agent.address       && !existing.addressLine1 ? { addressLine1: agent.address }       : {}),
            ...(agent.zipCode       && !existing.zip         ? { zip: agent.zipCode }                : {}),
            // DO NOT sync phase here. AFF `phase` is the agent's
            // onboarding focus area, owned by the vault tracker
            // (the "Advance to Phase X" button + promotion items).
            // Tevah's `level` is a separate platform concept. Mapping
            // it onto phase every hourly sync clobbered every manual
            // promotion an admin made (they'd promote at night, the
            // cron reverted them by morning because Tevah's level
            // hadn't changed). Phase is still seeded from Tevah on
            // NEW agent creation (see agentProfileData) as a sane
            // default; after that it's AFF-owned.
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

        // Public Discord celebration. Only fires when Tevah shipped a
        // `reference` for this agent (resolving to a recruiterId on
        // the profile) — without a recruiter, the card has no
        // protagonist. The helper handles the lookup, embed build,
        // and channel post; we just await it inline so the announced
        // counter on the summary is accurate. Failure here doesn't
        // abort the sync.
        // Public welcome on Tevah sync is OFF by default (disabled per request).
        // Re-enable by setting WELCOME_ANNOUNCE_ON_TEVAH = "on" in settings.
        if (newProfileId && (await getSetting('WELCOME_ANNOUNCE_ON_TEVAH')) === 'on') {
          const announce = await celebrateNewBusinessPartner({
            agentProfileId: newProfileId,
          }).catch(err => {
            console.error('[tevah-sync/agents] celebrate threw:', err)
            return null
          })
          if (announce?.ok) results.announced++
        }

        // Auto-advance any matching Contact in the recruiting pipeline
        // to "Active Agent" — this closes the loop from lead to agent.
        autoAdvanceContactOnAgentCreation({
          email: email ?? undefined,
          phone: agent.phone ?? undefined,
          firstName: agent.firstName,
          lastName: agent.lastName,
        }).catch(() => {})

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
    tevahAgentId: agent.id,
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
  // For each split pair, only the record with the lowest Tevah ID is the
  // "primary" — we create one AFF submission for it and link the other
  // agent via splitWithAgentId. Secondary records are skipped to avoid
  // creating duplicate submissions that double-count points and apps.
  const byPolicyNumber = new Map<string, TevahClient[]>()
  for (const c of clients) {
    if (c.policyNumber?.trim()) {
      const key = c.policyNumber.trim()
      const arr = byPolicyNumber.get(key) ?? []
      arr.push(c)
      byPolicyNumber.set(key, arr)
    }
  }

  const skipTevahIds = new Set<number>()
  for (const group of byPolicyNumber.values()) {
    if (group.length >= 2) {
      const sorted = [...group].sort((a, b) => a.id - b.id)
      // Everything after the lowest-ID record is secondary — skip them.
      sorted.slice(1).forEach(c => skipTevahIds.add(c.id))
    }
  }

  const results = { created: 0, updated: 0, skipped: 0, errors: 0, announced: 0 }
  const now = Date.now()
  const autoAssignee = await getAutoAssignee()

  // Tevah is authoritative ONLY for terminal outcomes. Everything else maps
  // to PENDING, and the LC owns the working lifecycle (New/Pending/Hold) in
  // the vault. Re-applying Tevah's PENDING on every sync was silently
  // reverting the LC's manual status hourly, so we only let a TERMINAL Tevah
  // status overwrite an existing submission; a PENDING from Tevah never
  // clobbers a status the LC has moved.
  const TERMINAL_TEVAH_STATUSES = new Set<NewBusinessStatus>(['ISSUED', 'DECLINED', 'LAPSED'])

  for (const client of clients) {
    try {
      // Skip secondary split records — they're linked via the primary's splitWithAgentId.
      if (skipTevahIds.has(client.id)) {
        results.skipped++
        continue
      }

      const existing = existingByTevahId.get(client.id)
      // Prefer policyStatus (more specific) over status when available.
      const newStatus = tevahStatusToAff(client.policyStatus || client.status) as NewBusinessStatus

      if (existing) {
        // Only a terminal Tevah outcome may change the status; a PENDING from
        // Tevah leaves the LC's current status untouched. Policy number is
        // factual, so always keep it current.
        const applyStatus = newStatus !== existing.status && TERMINAL_TEVAH_STATUSES.has(newStatus)
        const policyChanged = existing.policyNumber !== client.policyNumber
        if (applyStatus || policyChanged) {
          await db.newBusinessSubmission.update({
            where: { tevahClientId: client.id },
            data: {
              ...(applyStatus ? { status: newStatus } : {}),
              policyNumber: client.policyNumber ?? undefined,
              ...(newStatus === 'ISSUED' && client.policyIssueDate
                ? { issuedDate: new Date(client.policyIssueDate) }
                : {}),
            },
          })
          // Audit trail: any status change the SYNC makes is now visible in
          // the submission's Activity tab (actor = null = Tevah sync). This
          // is the safeguard for the invisible-overwrite class of bug — a
          // mass status change by the sync is one query away, not a mystery.
          if (applyStatus) {
            logSubmissionActivity({
              submissionId: existing.id,
              kind: 'STATUS_CHANGED',
              actorAdminId: null,
              meta: { from: existing.status, to: newStatus, source: 'tevah_sync' },
            }).catch(() => {})
          }
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

      const { firstName: clientFirst, lastName: clientLast } = parseTevahClientName(client.clientName)
      const policyType = tevahProductToAffPolicyType(client.productType, client.insuranceType) as PolicyType

      // Application date priority: submitDate > policyIssueDate > createdDate.
      // Always fall back to Tevah's createdDate rather than today — using today
      // as the fallback caused all historical imports to show the sync-run date.
      const applicationDate = client.submitDate
        ? new Date(client.submitDate)
        : client.policyIssueDate
          ? new Date(client.policyIssueDate)
          : new Date(client.createdDate)

      // Agent-portal submissions land with tevahClientId = null. Before
      // creating a new row we try to find one of those and upgrade it
      // in place, otherwise we'd double-count the policy on the
      // leaderboard. Match strategy (strongest signal first):
      //   1. Exact policyNumber match (same writer, no tevahClientId yet).
      //      Carriers issue a policy number shortly after submission; the
      //      agent will have entered it when the carrier emailed them.
      //   2. Fuzzy match on writer + carrier (normalized) + client
      //      first/last name (normalized) + applicationDate within
      //      ±60 days. Catches the case where the agent submitted
      //      before the carrier issued a policy number, and where the
      //      carrier string differs cosmetically between manual entry
      //      ("Ethos") and the Tevah feed ("Ethos Life Insurance Co").
      // We never match across different writers — splits get one row per
      // writer per the existing model, so cross-writer matching would
      // collapse two legitimate rows into one.
      const CARRIER = client.carrierDisplayName || client.carrierName
      const FUZZY_WINDOW_MS = 60 * 24 * 60 * 60 * 1000
      const { normCarrier, normName } = await import('@/lib/submission-merge')
      const carrierNorm = normCarrier(CARRIER)
      const clientFirstN = normName(clientFirst)
      const clientLastN = normName(clientLast)

      let matchedExistingId: string | null = null
      if (client.policyNumber?.trim()) {
        const byNumber = await db.newBusinessSubmission.findFirst({
          where: {
            tevahClientId: null,
            policyNumber: client.policyNumber.trim(),
            agentProfileId: writerProfile.id,
          },
          select: { id: true },
        })
        matchedExistingId = byNumber?.id ?? null
      }
      if (!matchedExistingId) {
        // Pull candidates by writer + ±60d window, then filter by
        // normalized carrier + name in JS (Prisma can't normalize
        // server-side). Manual rows are rare per writer, so the
        // candidate set is small.
        const candidates = await db.newBusinessSubmission.findMany({
          where: {
            tevahClientId: null,
            agentProfileId: writerProfile.id,
            applicationDate: {
              gte: new Date(applicationDate.getTime() - FUZZY_WINDOW_MS),
              lte: new Date(applicationDate.getTime() + FUZZY_WINDOW_MS),
            },
          },
          select: {
            id: true, carrier: true, clientFirstName: true, clientLastName: true,
            policyType: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
        const matched = candidates.find(c =>
          normCarrier(c.carrier) === carrierNorm &&
          normName(c.clientFirstName) === clientFirstN &&
          normName(c.clientLastName) === clientLastN,
        )
        matchedExistingId = matched?.id ?? null
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

      // Store the full policy premium as points. The leaderboard already
      // halves points for submissions where splitWithAgentId is set, matching
      // the behaviour for manually-entered splits.
      const points = client.annualPremiumAmount
        ? parseFloat(client.annualPremiumAmount)
        : client.premiumAmount
          ? parseFloat(client.premiumAmount)
          : null

      if (matchedExistingId) {
        // Upgrade an agent-portal submission into a Tevah-tracked row.
        // Status, policy number, premium come from Tevah (authoritative);
        // the original agent-entered client name + carrier stay so we
        // don't churn UI text that the agent's already familiar with.
        await db.newBusinessSubmission.update({
          where: { id: matchedExistingId },
          data: {
            tevahClientId: client.id,
            // Keep the LC's/agent's existing status unless Tevah reports a
            // terminal outcome; don't reset a worked submission to PENDING.
            ...(TERMINAL_TEVAH_STATUSES.has(newStatus) ? { status: newStatus } : {}),
            policyNumber: client.policyNumber ?? undefined,
            points: points ?? undefined,
            splitWithAgentId: splitPartnerProfile?.id ?? undefined,
            ...(newStatus === 'ISSUED' && client.policyIssueDate
              ? { issuedDate: new Date(client.policyIssueDate) }
              : {}),
          },
        })
        results.updated++
        continue
      }

      await db.newBusinessSubmission.create({
        data: {
          agentProfileId:   writerProfile.id,
          splitWithAgentId: splitPartnerProfile?.id ?? null,
          assignedToId:     newStatus === 'PENDING' ? autoAssignee : null,
          clientFirstName:  clientFirst,
          clientLastName:   clientLast,
          clientPhone:      client.clientPhone ?? null,
          clientEmail:      client.clientEmail ?? null,
          carrier:          CARRIER,
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

      // Only announce when the application date is genuinely recent (within
      // the 48-hour window). Using applicationDate (not createdDate) ensures
      // historical policies entered into Tevah today don't flood Discord.
      if (now - applicationDate.getTime() < ANNOUNCE_WINDOW_MS) {
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

  // Backfill: assign any PENDING submissions that are unassigned or assigned
  // to a test account. Handles records created before auto-assign was
  // introduced and fixes bad assignments to test-flagged LC accounts.
  if (autoAssignee) {
    const testAdminIds = (await db.adminUser.findMany({
      where: { isTest: true },
      select: { id: true },
    })).map(a => a.id)

    await db.newBusinessSubmission.updateMany({
      where: {
        status: 'PENDING',
        OR: [
          { assignedToId: null },
          ...(testAdminIds.length > 0 ? [{ assignedToId: { in: testAdminIds } }] : []),
        ],
      },
      data: { assignedToId: autoAssignee },
    })
  }

  return results
}
