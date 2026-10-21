// Master switch for Discord posts from the web app.
//
// Discord is being handed to Cadre. Everything the team sees publicly is
// silenced: #announcements, training, schedule, leaderboard, blog, and the
// daily motivation. The internal ACTIVITY feeds stay on, because those are
// staff tooling rather than Cadre duplication (agent feedback tickets,
// licensing-ticket pings, the LC audit feed, sign-in alerts).
//
// This is an ALLOWLIST enforced at the single choke point (sendChannelMessage)
// rather than per-route, deliberately. The per-route switches leaked badly: 7
// admin training routes bypassed the training toggle, 2 routes bypassed the
// welcome-announce settings, MOTIVATION_ENABLED defaulted ON, and ~8 files
// hardcode the announcements channel id as a fallback so clearing the env var
// would not have silenced them. Gating the choke point closes all of it at
// once and cannot be bypassed by a new call site.
//
// DM channel ids are created per-conversation and are therefore never on the
// allowlist, so DMs are silenced too. That information still reaches staff via
// the activity feeds and the in-app notification bell.
//
// To bring a channel back, add its id here. To restore everything at once,
// set DISCORD_POSTS_ALLOW_ALL=1.

// Known activity-channel ids, used when the env var is unset (several call
// sites already hardcode these same fallbacks).
const ACTIVITY_FALLBACK_IDS = [
  '1497704771149107385', // #admin-activity
  '1501070249695383622', // #agent-activity
  '1503502232669389030', // #lc-activity
]

export function allowedDiscordChannelIds(): Set<string> {
  const ids = new Set<string>()
  for (const v of [
    process.env.DISCORD_ADMIN_CHANNEL_ID,
    process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID,
    process.env.DISCORD_LC_ACTIVITY_CHANNEL_ID,
  ]) {
    if (v && v.trim()) ids.add(v.trim())
  }
  for (const id of ACTIVITY_FALLBACK_IDS) ids.add(id)
  return ids
}

export function discordPostAllowed(channelId: string | null | undefined): boolean {
  if (process.env.DISCORD_POSTS_ALLOW_ALL === '1') return true
  if (!channelId) return false
  return allowedDiscordChannelIds().has(channelId.trim())
}
