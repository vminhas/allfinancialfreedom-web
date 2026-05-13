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

const ACTIVITY_CHANNEL_FALLBACK = '1501070249695383622'
const ANNOUNCEMENTS_FALLBACK    = '1295044213590982724'

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
  if (!def || (!def.postToActivity && !def.postToAnnouncements)) return empty

  const profile = await db.agentProfile.findUnique({
    where: { id: args.agentProfileId },
    select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true },
  })
  if (!profile) return empty

  if (!process.env.DISCORD_BOT_TOKEN) return empty

  const { sendChannelMessage } = await import('./discord')
  const agentName = `${profile.firstName} ${profile.lastName}`.trim()
  const activityChannel = process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID ?? ACTIVITY_CHANNEL_FALLBACK
  const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? ANNOUNCEMENTS_FALLBACK
  const adminUserId = process.env.DISCORD_ADMIN_USER_ID

  let activityMsgId: string | null = null
  let announcementMsgId: string | null = null

  if (def.postToActivity) {
    const color = def.pingAdmin ? 0xFFD700 : (PHASE_COLORS[args.phase] ?? 0xC9A96E)
    const res = await sendChannelMessage(activityChannel, {
      content: def.pingAdmin && adminUserId ? `<@${adminUserId}>` : undefined,
      embeds: [{
        description: `**${agentName}** completed *${def.label}*`,
        color,
        footer: { text: `Phase ${args.phase} · ${profile.agentCode}` },
        timestamp: new Date().toISOString(),
      } as unknown as JsonValue],
    }).catch(() => null)
    activityMsgId = (res as { id?: string } | null)?.id ?? null
  }

  if (def.postToAnnouncements) {
    const { buildAchievementEmbed } = await import('./discord-card')
    const res = await sendChannelMessage(announcementsChannel, {
      embeds: [
        buildAchievementEmbed({
          flavor: 'MILESTONE',
          protagonist: {
            firstName: profile.firstName,
            lastName: profile.lastName,
            agentCode: profile.agentCode,
            avatarUrl: profile.avatarUrl,
          },
          subline: `Completed **${def.label}**`,
          fields: [
            { name: 'Phase', value: PHASE_TITLES[args.phase] ?? `Phase ${args.phase}`, inline: true },
            { name: 'Agent', value: '`' + profile.agentCode + '`',                     inline: true },
          ],
        }),
      ],
    }).catch(() => null)
    announcementMsgId = (res as { id?: string } | null)?.id ?? null
  }

  return { activityMsgId, announcementMsgId }
}
