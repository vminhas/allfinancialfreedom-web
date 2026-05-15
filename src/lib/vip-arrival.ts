import { sendChannelMessage, type DiscordEmbed } from './discord'
import { getSettings } from './settings'
import { db } from './db'

// Manual "red carpet" for a single distinguished guest (currently a GFI
// co-founder evaluating the portal). Deliberately bespoke instead of
// reusing buildAchievementEmbed: that factory hardcodes an
// "All Financial Freedom" footer, and for this card the brand is
// intentionally left off (the guest sits above AFF). No metrics, no
// faith references, no brand stamp. Just a classy welcome.
//
// Scoped hard to ONE configured agentCode so an accidental click on a
// normal agent's profile can never blast a red-carpet @everyone.

const GOLD = 0xc9a84c
const ANNOUNCEMENTS_CHANNEL =
  process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
const ADMIN_ACTIVITY_CHANNEL = process.env.DISCORD_ADMIN_CHANNEL_ID

// Discord user IDs for the personal-welcome nudge. Mirrors the EDITORS
// list in discord-bot/config.js; duplicated here so the web app can tag
// them without importing the bot's config.
const VICK_DISCORD_ID = '1248710966879715381'
const MELINEE_DISCORD_ID = '857638016074907649'

export type VipArrivalResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'not_vip' | 'no_profile' | 'no_token' | 'send_failed' }

export async function fireVipArrival(
  agentProfileId: string,
): Promise<VipArrivalResult> {
  if (!process.env.DISCORD_BOT_TOKEN) return { ok: false, reason: 'no_token' }

  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: {
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      avatarUrl: true,
    },
  })
  if (!profile) return { ok: false, reason: 'no_profile' }

  const cfg = await getSettings(['VIP_ARRIVAL_AGENT_CODE', 'VIP_ARRIVAL_TITLE'])
  const vipCode = (cfg.VIP_ARRIVAL_AGENT_CODE ?? '').trim()
  if (
    !vipCode ||
    vipCode.toLowerCase() !== profile.agentCode.toLowerCase()
  ) {
    return { ok: false, reason: 'not_vip' }
  }

  const firstName = (profile.preferredName?.trim() || profile.firstName).trim()
  const fullName = `${firstName} ${profile.lastName}`.trim()
  const title = (cfg.VIP_ARRIVAL_TITLE ?? '').trim()

  const lines = [`# ${fullName}`]
  if (title) lines.push(`### ${title}`)
  lines.push(
    '',
    'The whole room just got a little brighter.',
    '',
    'It is a genuine honor to have you with us. Make yourself at home, the best seat in the house is yours.',
  )

  const embed: DiscordEmbed = {
    title: '✦   A   D I S T I N G U I S H E D   A R R I V A L   ✦',
    description: lines.join('\n'),
    color: GOLD,
    thumbnail: profile.avatarUrl ? { url: profile.avatarUrl } : undefined,
    footer: { text: 'With admiration and respect' },
    timestamp: new Date().toISOString(),
  }

  let msg: { id: string }
  try {
    msg = await sendChannelMessage(ANNOUNCEMENTS_CHANNEL, {
      content: '@everyone',
      embeds: [embed],
      allowedMentions: { parse: ['everyone'] },
    })
  } catch {
    return { ok: false, reason: 'send_failed' }
  }

  // Seed warm reactions so the team knows to pile on with their own
  // welcome. Best-effort; a failed reaction must not fail the post.
  for (const emoji of ['👏', '🔥', '🙌']) {
    await fetch(
      `https://discord.com/api/v10/channels/${ANNOUNCEMENTS_CHANNEL}/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}/@me`,
      {
        method: 'PUT',
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      },
    ).catch(() => {})
  }

  // Private nudge to Vick + Melinee so a real person greets him by
  // name, not just the auto card. Best-effort.
  if (ADMIN_ACTIVITY_CHANNEL) {
    await sendChannelMessage(ADMIN_ACTIVITY_CHANNEL, {
      content: `<@${VICK_DISCORD_ID}> <@${MELINEE_DISCORD_ID}> ${fullName}'s arrival card just went live in the announcements channel. Drop him a personal welcome when you get a moment.`,
      allowedMentions: { parse: ['users'] },
    }).catch(() => {})
  }

  return { ok: true, messageId: msg.id }
}
