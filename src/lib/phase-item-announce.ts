// Fire the Discord celebrations a phase item is configured to fire
// when it transitions to completed=true. Same logic agents trigger
// via /api/agents/progress when they tick a box themselves; also
// reused by admin-approval paths (promotion requests, milestone
// review) so a SA Promotion approved by Vick celebrates exactly
// like a self-completion would have.
//
// Reads postToActivity / postToAnnouncements / pingAdmin off the
// PhaseItemDefinition. Returns the message IDs so the caller can
// stash them on the PhaseItem row (the agent-self path does this
// to support de-duplication on re-completion).

import { db } from './db'
import { titleForPromotionItem } from './agent-title'

const ACTIVITY_CHANNEL_FALLBACK = '1501070249695383622'
const ANNOUNCEMENTS_FALLBACK    = '1295044213590982724'

// Rank-promotion phase items always broadcast to #announcements, no
// matter what `post_to_announcements` happens to be in the DB for them.
// These are CEO-critical celebratory moments (every rank earn the team
// has) and we refuse to make them dependent on an admin remembering to
// tick a per-item toggle in the checklist editor. The corresponding
// migration (20260513000000_promotion_items_announce) keeps the DB flag
// in sync so the editor UI doesn't misrepresent reality, but the code
// here is the source of truth.
const ALWAYS_ANNOUNCE: ReadonlySet<string> = new Set([
  'associate_promotion', // Senior Associate
  'md_promotion',        // Marketing Director
  'emd_promotion',       // Executive Marketing Director
  'nvp_promotion',       // National Vice President
])

const PHASE_COLORS: Record<number, number> = {
  1: 0x60a5fa, 2: 0x4ade80, 3: 0xC9A96E, 4: 0xa78bfa, 5: 0xf472b6, 6: 0xFFD54F,
}

const PHASE_TITLES: Record<number, string> = {
  1: 'Onboarding', 2: 'Training', 3: 'Advancement', 4: 'Leadership', 5: 'Mastery', 6: 'Legacy',
}

export async function announcePhaseItemCompletion(args: {
  agentProfileId: string
  itemKey: string
  phase: number
}): Promise<{ activityMsgId: string | null; announcementMsgId: string | null }> {
  const empty = { activityMsgId: null, announcementMsgId: null }

  const def = await db.phaseItemDefinition.findUnique({
    where: { itemKey: args.itemKey },
    select: { label: true, postToActivity: true, postToAnnouncements: true, pingAdmin: true },
  })
  if (!def) {
    console.warn(`[announcePhaseItemCompletion] no PhaseItemDefinition for itemKey="${args.itemKey}"`)
    return empty
  }
  const forceAnnounce = ALWAYS_ANNOUNCE.has(args.itemKey)
  const shouldAnnounce = def.postToAnnouncements || forceAnnounce
  if (!def.postToActivity && !shouldAnnounce) {
    console.info(`[announcePhaseItemCompletion] both flags off for itemKey="${args.itemKey}" -- nothing to post`)
    return empty
  }

  const profile = await db.agentProfile.findUnique({
    where: { id: args.agentProfileId },
    select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true },
  })
  if (!profile) {
    console.warn(`[announcePhaseItemCompletion] no AgentProfile for id="${args.agentProfileId}"`)
    return empty
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    console.warn('[announcePhaseItemCompletion] DISCORD_BOT_TOKEN not set, skipping post')
    return empty
  }

  const { sendChannelMessage } = await import('./discord')
  const agentName = `${profile.firstName} ${profile.lastName}`.trim()
  const activityChannel = process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID ?? ACTIVITY_CHANNEL_FALLBACK
  const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? ANNOUNCEMENTS_FALLBACK
  const adminUserId = process.env.DISCORD_ADMIN_USER_ID

  let activityMsgId: string | null = null
  let announcementMsgId: string | null = null

  if (def.postToActivity) {
    const color = def.pingAdmin ? 0xFFD700 : (PHASE_COLORS[args.phase] ?? 0xC9A96E)
    try {
      const res = await sendChannelMessage(activityChannel, {
        content: def.pingAdmin && adminUserId ? `<@${adminUserId}>` : undefined,
        embeds: [{
          description: `**${agentName}** completed *${def.label}*`,
          color,
          footer: { text: `Phase ${args.phase} · ${profile.agentCode}` },
          timestamp: new Date().toISOString(),
        }],
      })
      activityMsgId = res?.id ?? null
    } catch (err) {
      console.error(`[announcePhaseItemCompletion] activity post FAILED for itemKey="${args.itemKey}" channel=${activityChannel}:`, err)
    }
  } else {
    console.info(`[announcePhaseItemCompletion] postToActivity=false for itemKey="${args.itemKey}", skipping activity post`)
  }

  if (shouldAnnounce) {
    if (forceAnnounce && !def.postToAnnouncements) {
      console.info(`[announcePhaseItemCompletion] forcing #announcements post for rank-gate itemKey="${args.itemKey}" (DB flag is off, ALWAYS_ANNOUNCE overrides)`)
    }
    // Rank promotions render as a PROMOTION-flavored embed with the
    // newly-earned title front and center; everything else stays a
    // generic MILESTONE. The title comes from the same RANK_OVERRIDES
    // table the resolver reads, so the announcement and the agent's
    // displayed title are guaranteed to agree.
    const newTitle = titleForPromotionItem(args.itemKey)
    const isRankPromotion = newTitle !== null
    const { buildAchievementEmbed } = await import('./discord-card')
    try {
      const res = await sendChannelMessage(announcementsChannel, {
        embeds: [
          buildAchievementEmbed({
            flavor: isRankPromotion ? 'PROMOTION' : 'MILESTONE',
            protagonist: {
              firstName: profile.firstName,
              lastName: profile.lastName,
              agentCode: profile.agentCode,
              avatarUrl: profile.avatarUrl,
            },
            subline: isRankPromotion
              ? `Promoted to **${newTitle}**`
              : `Completed **${def.label}**`,
            fields: isRankPromotion
              ? [
                  { name: 'New Title', value: newTitle!,                       inline: true },
                  { name: 'Agent',     value: '`' + profile.agentCode + '`',   inline: true },
                ]
              : [
                  { name: 'Phase', value: PHASE_TITLES[args.phase] ?? `Phase ${args.phase}`, inline: true },
                  { name: 'Agent', value: '`' + profile.agentCode + '`',                     inline: true },
                ],
          }),
        ],
      })
      announcementMsgId = res?.id ?? null
    } catch (err) {
      console.error(`[announcePhaseItemCompletion] announcement post FAILED for itemKey="${args.itemKey}" channel=${announcementsChannel}:`, err)
    }
  } else {
    console.info(`[announcePhaseItemCompletion] postToAnnouncements=false (and not in ALWAYS_ANNOUNCE) for itemKey="${args.itemKey}", skipping announcement post`)
  }

  return { activityMsgId, announcementMsgId }
}
