import { NextRequest, NextResponse } from 'next/server'
import {
  verifyDiscordSignature,
  InteractionType,
  InteractionResponseType,
  MessageFlags,
  editOriginalInteractionResponse,
} from '@/lib/discord-interactions'
import { approveReferral } from '@/lib/referral-approval'
import { db } from '@/lib/db'

// Discord interactions endpoint. Called whenever someone clicks a button
// (or runs a slash command, etc.) on a message our bot posted.
//
// Setup: in the Discord developer portal under General Information set the
// "Interactions Endpoint URL" to https://YOUR-DOMAIN/api/discord/interactions.
// Discord sends a PING when saving — we must respond with PONG using the
// same Ed25519 signature scheme as real interactions, so DISCORD_PUBLIC_KEY
// must be set first.
//
// Auth model for the approve button: anyone with access to the admin channel
// can click. The channel ACL is the auth boundary. We log the Discord
// username of whoever clicked into the AgentReferral row and into the edited
// embed for the audit trail.

export const runtime = 'nodejs'

interface DiscordInteraction {
  type: number
  id: string
  application_id: string
  token: string
  data?: {
    custom_id?: string
    component_type?: number
    // Modal submission payloads carry the user's text input here.
    components?: { components: { custom_id: string; value: string }[] }[]
  }
  member?: { user?: { id: string; username: string; global_name?: string | null } }
  user?: { id: string; username: string; global_name?: string | null }
  message?: { embeds?: Record<string, unknown>[]; id?: string }
}

export async function POST(req: NextRequest) {
  // Discord requires us to verify the Ed25519 signature on every call. The
  // signature is over (timestamp + raw body) so we can't use req.json() before
  // verifying — read the raw text first.
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const rawBody = await req.text()

  if (!signature || !timestamp || !verifyDiscordSignature(rawBody, signature, timestamp)) {
    return new NextResponse('invalid request signature', { status: 401 })
  }

  let interaction: DiscordInteraction
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction
  } catch {
    return new NextResponse('bad json', { status: 400 })
  }

  // PING — Discord verification handshake during endpoint setup.
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG })
  }

  // Button click on a referral notification.
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id ?? ''
    if (customId.startsWith('referral-approve:')) {
      const referralId = customId.slice('referral-approve:'.length)
      return handleReferralApprove(interaction, referralId)
    }
    if (customId.startsWith('referral-reject:')) {
      const referralId = customId.slice('referral-reject:'.length)
      return handleReferralReject(interaction, referralId)
    }
    if (customId.startsWith('agent-kick:')) {
      // First click: ask for confirmation instead of kicking immediately.
      // Format: agent-kick:<discordUserId>:<agentProfileId>
      const [, discordUserId, agentProfileId] = customId.split(':')
      return handleAgentKickPrompt(interaction, discordUserId, agentProfileId)
    }
    if (customId.startsWith('agent-kick-confirm:')) {
      // Second click after confirm. Actually kicks.
      const [, discordUserId, agentProfileId] = customId.split(':')
      return handleAgentKick(interaction, discordUserId, agentProfileId)
    }
    if (customId.startsWith('agent-kick-cancel:')) {
      // Cancel the confirm prompt: restore the original kick button.
      const [, discordUserId, agentProfileId] = customId.split(':')
      return handleAgentKickCancel(interaction, discordUserId, agentProfileId)
    }
    if (customId.startsWith('agent-search:')) {
      // Open a modal with a text input for manual Discord lookup.
      const [, agentProfileId] = customId.split(':')
      return openSearchModal(agentProfileId)
    }
    if (customId.startsWith('lb_')) {
      return handleLeaderboardTab(customId)
    }
  }

  // Modal submissions (manual Discord search).
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    const customId = interaction.data?.custom_id ?? ''
    if (customId.startsWith('agent-search-modal:')) {
      const [, agentProfileId] = customId.split(':')
      const query = interaction.data?.components?.[0]?.components?.[0]?.value ?? ''
      return handleSearchSubmit(interaction, agentProfileId, query)
    }
  }

  // Anything we don't recognize — return an ephemeral fallback so the user
  // sees a clear "nothing happened" instead of a hung interaction.
  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "I don't know how to handle that yet.", flags: MessageFlags.EPHEMERAL },
  })
}

function clickerLabel(interaction: DiscordInteraction): string {
  const u = interaction.member?.user ?? interaction.user
  if (!u) return 'someone'
  return u.global_name ?? u.username
}

async function handleReferralApprove(interaction: DiscordInteraction, referralId: string) {
  const clicker = clickerLabel(interaction)

  // The approval is heavier than 3s sometimes (DB writes + GHL email round
  // trip), so we acknowledge with DEFERRED_UPDATE_MESSAGE and finish the
  // work in the background. Discord keeps the original embed visible until
  // we PATCH it via the followup webhook.
  const result = await approveReferral({
    referralId,
    approvedById: `discord:${clicker}`,
    approvedByLabel: clicker,
  })

  // Build the post-approval embed in either success or error shape.
  const baseEmbed = interaction.message?.embeds?.[0] ?? {}

  if (!result.ok) {
    // Edit the original message inline to show the failure but keep the
    // approve button removed so we don't double-submit on retry.
    return NextResponse.json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [{
          ...baseEmbed,
          title: '⚠️ Approval Failed',
          color: 0xEF4444,
          footer: { text: `Tried by ${clicker} · ${result.error ?? 'unknown error'}` },
        }],
        components: [],  // strip the buttons
      },
    })
  }

  // Success — strip buttons, recolor green, append who approved + when.
  const referral = await db.agentReferral.findUnique({
    where: { id: referralId },
    select: { firstName: true, lastName: true },
  })
  const clientName = referral ? `${referral.firstName} ${referral.lastName}` : 'the referral'

  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        title: '✅ Approved',
        description: `**${clientName}** has been approved and the welcome email is on its way.${result.emailSent ? '' : '\n\n_Welcome email send did not confirm — re-send from My Team if needed._'}`,
        color: 0x4ADE80,
        footer: { text: `Approved by ${clicker} · Agent code ${result.agentCode}` },
        timestamp: new Date().toISOString(),
      }],
      components: [],
    },
  })
}

async function handleReferralReject(interaction: DiscordInteraction, referralId: string) {
  const clicker = clickerLabel(interaction)
  const referral = await db.agentReferral.findUnique({
    where: { id: referralId },
    select: { status: true, firstName: true, lastName: true },
  })
  if (!referral) {
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Referral not found.', flags: MessageFlags.EPHEMERAL },
    })
  }
  if (referral.status !== 'PENDING') {
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Already ${referral.status.toLowerCase()}.`, flags: MessageFlags.EPHEMERAL },
    })
  }

  await db.agentReferral.update({
    where: { id: referralId },
    data: {
      status: 'REJECTED',
      approvedAt: new Date(),
      approvedById: `discord:${clicker}`,
    },
  })

  const baseEmbed = interaction.message?.embeds?.[0] ?? {}
  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        title: '🚫 Rejected',
        description: `**${referral.firstName} ${referral.lastName}**'s referral was rejected.`,
        color: 0x6B7280,
        footer: { text: `Rejected by ${clicker}` },
        timestamp: new Date().toISOString(),
      }],
      components: [],
    },
  })
}

// Suppress unused-import lint — editOriginalInteractionResponse is exported
// from the lib for future flows that need to follow up after a deferred
// response. This route uses synchronous UPDATE_MESSAGE so we don't call it.
void editOriginalInteractionResponse

// First click on "Kick from Discord" doesn't kick — it swaps the
// embed for a confirm prompt so we don't act on accidental clicks.
// The original red button is replaced with Confirm + Cancel.
function handleAgentKickPrompt(interaction: DiscordInteraction, discordUserId: string, agentProfileId: string) {
  const baseEmbed = interaction.message?.embeds?.[0] ?? {}
  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        title: '⚠️ Confirm kick from Discord',
        description: `${(baseEmbed as { description?: string }).description ?? ''}\n\n_This will remove them from the AFF Discord server. They can be re-invited later._`,
        color: 0xEF4444,
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 4, label: 'Yes, kick them', custom_id: `agent-kick-confirm:${discordUserId}:${agentProfileId}` },
          { type: 2, style: 2, label: 'Cancel',          custom_id: `agent-kick-cancel:${discordUserId}:${agentProfileId}` },
        ],
      }],
    },
  })
}

// Cancel from the confirm prompt. Restores the original kick button so
// the admin can take the action later if they decide to.
function handleAgentKickCancel(interaction: DiscordInteraction, discordUserId: string, agentProfileId: string) {
  const baseEmbed = interaction.message?.embeds?.[0] ?? {}
  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        title: '⚠️ Agent marked inactive',
        description: ((baseEmbed as { description?: string }).description ?? '').replace(/\n\n_This will remove them from[\s\S]+/, ''),
        color: 0xF59E0B,
      }],
      components: [{
        type: 1,
        components: [{
          type: 2, style: 4, label: 'Kick from Discord',
          custom_id: `agent-kick:${discordUserId}:${agentProfileId}`,
        }],
      }],
    },
  })
}

// Open a Discord modal with a text input so the admin can search guild
// membership manually when the auto-match in the original embed didn't
// find the agent. Returns InteractionResponseType.MODAL.
function openSearchModal(agentProfileId: string) {
  return NextResponse.json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: `agent-search-modal:${agentProfileId}`,
      title: 'Search Discord by name',
      components: [{
        type: 1,
        components: [{
          type: 4,  // text input
          custom_id: 'query',
          label: 'Discord username, display name, or nickname',
          style: 1,  // short
          min_length: 2,
          max_length: 50,
          required: true,
          placeholder: 'e.g. bryan, thecole, BryanC',
        }],
      }],
    },
  })
}

// Modal submission: take the query, search guild members, and rebuild
// the original deactivation embed with up to 5 candidates each
// carrying their own kick button.
async function handleSearchSubmit(interaction: DiscordInteraction, agentProfileId: string, query: string) {
  const baseEmbed = interaction.message?.embeds?.[0] ?? {}
  const { searchGuildMembers } = await import('@/lib/discord')
  const candidates = await searchGuildMembers(query.trim(), 5)

  if (candidates.length === 0) {
    return NextResponse.json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [{
          ...baseEmbed,
          fields: [
            ...((baseEmbed as { fields?: { name: string; value: string; inline?: boolean }[] }).fields?.filter(f => f.name !== 'Search results') ?? []),
            { name: 'Search results', value: `No members matched \`${query}\`.`, inline: false },
          ],
        }],
        // Keep the search button so they can retry with a different query.
        components: [{
          type: 1,
          components: [{
            type: 2, style: 2, label: 'Search again',
            custom_id: `agent-search:${agentProfileId}`,
          }],
        }],
      },
    })
  }

  // Show the candidates as a numbered list in a field, with one kick
  // button per candidate (Discord allows up to 5 buttons in a row).
  const list = candidates.map((m, i) => {
    const display = m.user.global_name ?? m.user.username
    const nick = m.nick ? ` (${m.nick})` : ''
    return `**${i + 1}.** ${display}${nick} — <@${m.user.id}>`
  }).join('\n')

  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        fields: [
          ...((baseEmbed as { fields?: { name: string; value: string; inline?: boolean }[] }).fields?.filter(f => f.name !== 'Search results') ?? []),
          { name: 'Search results', value: list, inline: false },
        ],
      }],
      components: [{
        type: 1,
        components: candidates.slice(0, 5).map((m, i) => ({
          type: 2,
          style: 4,
          label: `Kick #${i + 1}`,
          custom_id: `agent-kick:${m.user.id}:${agentProfileId}`,
        })),
      }],
    },
  })
}

// Leaderboard tab buttons (lb_recruits, lb_production, lb_promotions, lb_movers).
// These are posted by the bot process but handled here because Discord
// routes all button interactions to the Interactions Endpoint URL, not
// the WebSocket bot. We query the DB directly to avoid an internal HTTP
// round-trip.
async function handleLeaderboardTab(customId: string) {
  const { TITLE_OVERRIDE_ITEM_KEYS, titleForPromotionItem } = await import('@/lib/agent-title')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const monthLabel = now.toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'America/New_York',
  })
  const updatedAt = now.toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const roster = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: {
      id: true, agentCode: true, firstName: true, lastName: true,
      isLeadership: true,
      // Couple metadata for the recruits bundling below — mirrors the
      // shape discord-snapshot uses so the two views agree on how to
      // label "Vick & Melinee" (or any future founder pair).
      partnerAgentProfileId: true,
      partnerDisplayName: true,
      coupleDisplayName: true,
    },
  })
  const rosterIds = roster.map(r => r.id)
  const idSet = new Set(rosterIds)
  const leadershipIds = new Set(roster.filter(r => r.isLeadership).map(r => r.id))

  const MEDAL_EMOJI = ['🥇', '🥈', '🥉']
  const rankLine = (i: number, name: string, value: number, unit: string) => {
    const prefix = i < 3 ? MEDAL_EMOJI[i] : `${i + 1}.`
    const padded = name.length > 22 ? name.slice(0, 21) + '…' : name.padEnd(22)
    const plural = value !== 1 ? unit + 's' : unit
    return `${prefix}  \`${padded}\`  **${value}** ${plural}`
  }
  const toName = (id: string) => { const a = roster.find(r => r.id === id); return a ? `${a.firstName} ${a.lastName}` : id }

  // Always query recruits and production so all tabs have fresh data.
  let subLines = '_No submissions this month._'
  let submissionSummary = 'No submissions recorded this month.'
  let recLines = '_No new recruits this month._'
  let recruitSummary = 'No recruits recorded this month.'
  let promoLines = '_No promotions recorded yet this month._'

  if (rosterIds.length > 0) {
    const subs = await db.newBusinessSubmission.findMany({
      where: {
        applicationDate: { gte: monthStart, lte: now },
        OR: [{ agentProfileId: { in: rosterIds } }, { splitWithAgentId: { in: rosterIds } }],
      },
      select: { agentProfileId: true, splitWithAgentId: true },
    })
    const subCounts = new Map<string, number>()
    for (const s of subs) {
      if (idSet.has(s.agentProfileId))
        subCounts.set(s.agentProfileId, (subCounts.get(s.agentProfileId) ?? 0) + 1)
      if (s.splitWithAgentId && idSet.has(s.splitWithAgentId))
        subCounts.set(s.splitWithAgentId, (subCounts.get(s.splitWithAgentId) ?? 0) + 1)
    }
    const topSubs = [...subCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (topSubs.length > 0) {
      subLines = topSubs.map(([id, v], i) => rankLine(i, toName(id), v, 'app')).join('\n')
      const total = [...subCounts.values()].reduce((a, b) => a + b, 0)
      submissionSummary = `**${total}** app${total !== 1 ? 's' : ''} · ${subCounts.size} active agent${subCounts.size !== 1 ? 's' : ''}`
    }

    const newAgents = await db.agentProfile.findMany({
      where: { isTest: false, createdAt: { gte: monthStart, lte: now } },
      select: { recruiterId: true },
    }) as Array<{ recruiterId: string | null }>
    const codeToId = new Map(roster.map(r => [r.agentCode, r.id]))

    // Leadership recruits roll up into one synthetic "Vick & Melinee"
    // bucket so the recruits leaderboard reads as a single founder
    // contribution instead of splitting the credit across two rows (or
    // hiding the row whose individual count is zero). Matches the
    // pattern used by /api/admin/leaderboard/discord-snapshot — when
    // we factor resolveCouple into a shared lib, both routes will read
    // from it. Until then this is the agreed-upon shape: one bundled
    // row, label drawn from the leadership profiles themselves so a
    // future Vick/Melinee retitle Just Works without a code change.
    const LEADERSHIP_KEY = '__leadership__'
    const recruitCounts = new Map<string, number>()
    let leadershipCount = 0
    for (const a of newAgents) {
      if (!a.recruiterId) continue
      const id = codeToId.get(a.recruiterId)
      if (!id) continue
      if (leadershipIds.has(id)) {
        leadershipCount += 1
      } else {
        recruitCounts.set(id, (recruitCounts.get(id) ?? 0) + 1)
      }
    }
    // Build the leadership label from the flagged profiles so white-
    // labeling keeps working: prefer an explicit coupleDisplayName,
    // otherwise join first names with " & " (Vick & Melinee).
    const leaders = roster.filter(r => r.isLeadership)
    const leadershipLabel = leaders.length === 0
      ? null
      : (leaders.find(l => l.coupleDisplayName)?.coupleDisplayName
        ?? leaders.map(l => l.firstName).join(' & '))
    if (leadershipCount > 0 && leadershipLabel) {
      recruitCounts.set(LEADERSHIP_KEY, leadershipCount)
    }

    const topRec = [...recruitCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (topRec.length > 0) {
      recLines = topRec.map(([key, v], i) => {
        const name = key === LEADERSHIP_KEY ? (leadershipLabel ?? 'Founders') : toName(key)
        return rankLine(i, name, v, 'recruit')
      }).join('\n')
      const totalRec = [...recruitCounts.values()].reduce((a, b) => a + b, 0)
      recruitSummary = `**${totalRec}** recruit${totalRec !== 1 ? 's' : ''} · ${recruitCounts.size} recruiter${recruitCounts.size !== 1 ? 's' : ''}`
    }

    // Promotions: title-bearing phase items completed this month
    const promoItems = await db.phaseItem.findMany({
      where: { itemKey: { in: TITLE_OVERRIDE_ITEM_KEYS }, completed: true, completedAt: { gte: monthStart, lte: now }, agentProfile: { isLeadership: false } },
      select: { itemKey: true, agentProfile: { select: { firstName: true, lastName: true } } },
    })
    const TITLE_EMOJI: Record<string, string> = {
      'Senior Associate': '⭐',
      'Marketing Director': '🚀',
      'Executive Marketing Director': '👑',
      'National Vice President': '💎',
    }
    if (promoItems.length > 0) {
      promoLines = promoItems.map(item => {
        const title = titleForPromotionItem(item.itemKey) ?? item.itemKey
        const name = `${item.agentProfile.firstName} ${item.agentProfile.lastName}`.trim()
        const emoji = TITLE_EMOJI[title] ?? '🎖️'
        return `${emoji}  **${name}**  promoted to **${title}**`
      }).join('\n')
    }
  }

  type View = 'recruits' | 'production' | 'promotions' | 'movers'
  const view: View = (customId === 'lb_production' ? 'production'
    : customId === 'lb_promotions' ? 'promotions'
    : customId === 'lb_movers' ? 'movers'
    : 'recruits') as View

  let embed: Record<string, unknown>
  if (view === 'production') {
    embed = {
      color: 0xC9A84C,
      title: `\u{1F3C6}  Monthly Production · ${monthLabel}`,
      description: (submissionSummary ? `${submissionSummary}\n\n` : '') + subLines,
      footer: { text: `Updated ${updatedAt} ET · allfinancialfreedom.com/agents/leaderboard` },
    }
  } else if (view === 'recruits') {
    embed = {
      color: 0x1a2744,
      title: `\u{1F91D}  Top Recruiters · ${monthLabel}`,
      description: (recruitSummary ? `${recruitSummary}\n\n` : '') + recLines,
      footer: { text: `Updated ${updatedAt} ET · allfinancialfreedom.com/agents/leaderboard` },
    }
  } else if (view === 'promotions') {
    embed = {
      color: 0xC9A84C,
      title: `\u{1F396}  Promotions · ${monthLabel}`,
      description: promoLines,
      footer: { text: `Updated ${updatedAt} ET` },
    }
  } else {
    embed = {
      color: 0x1a2744,
      title: `\u{1F331}  Phase Movers · ${monthLabel}`,
      description: '_Phase change tracking is refreshed by the daily bot post. Check back after the next update._',
      footer: { text: `Updated ${updatedAt} ET` },
    }
  }

  const btn = (id: string, label: string, active: boolean) => ({
    type: 2, style: active ? 1 : 2, label, custom_id: id,
  })
  const buttons = {
    type: 1,
    components: [
      btn('lb_recruits',    '\u{1F91D} Recruits',    view === 'recruits'),
      btn('lb_production',  '\u{1F3C6} Production',  view === 'production'),
      btn('lb_promotions',  '\u{1F396}️ Promotions', view === 'promotions'),
      btn('lb_movers',      '\u{1F331} Movers',      view === 'movers'),
    ],
  }

  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: { embeds: [embed], components: [buttons] },
  })
}

// Agent kick: pulled from a `agent-kick:<discordUserId>:<agentProfileId>`
// button posted on the deactivation embed. Removes the user from the
// guild and edits the original message to show who kicked them and
// when. Errors fall through to a friendly UPDATE_MESSAGE so the
// admin sees what went wrong instead of a stuck spinner.
async function handleAgentKick(interaction: DiscordInteraction, discordUserId: string, agentProfileId: string) {
  const clicker = clickerLabel(interaction)
  const baseEmbed = interaction.message?.embeds?.[0] ?? {}

  if (!discordUserId) {
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'No Discord user ID encoded on this button.', flags: MessageFlags.EPHEMERAL },
    })
  }

  try {
    const { kickGuildMember } = await import('@/lib/discord')
    await kickGuildMember(discordUserId, `Marked inactive in AFF portal by ${clicker}`)
  } catch (err) {
    return NextResponse.json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [{
          ...baseEmbed,
          title: '⚠️ Kick failed',
          color: 0xEF4444,
          footer: { text: `Tried by ${clicker} · ${err instanceof Error ? err.message : 'unknown error'}` },
        }],
        components: [],
      },
    })
  }

  // Clear the Discord ID off the agent profile so we don't try to
  // re-target a user who's no longer in the guild.
  await db.agentProfile.update({
    where: { id: agentProfileId },
    data: { discordUserId: null },
  }).catch(() => {})

  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        title: '🚪 Kicked from Discord',
        color: 0x6B7280,
        footer: { text: `Kicked by ${clicker}` },
        timestamp: new Date().toISOString(),
      }],
      components: [],
    },
  })
}
