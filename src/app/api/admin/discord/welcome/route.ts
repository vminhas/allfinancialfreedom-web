import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { sendChannelMessage } from '@/lib/discord'

// POST /api/admin/discord/welcome
//
// Manually trigger the public welcome card in #announcements for a
// Discord user who joined before the GuildMemberAdd handler was
// shipped (or whose join event the bot missed for any other reason).
//
// Mirrors the embed shape produced by buildPublicWelcomeEmbed in
// discord-bot/bot.js so the manual fire is visually identical to an
// automatic one. We resolve the member's display name + avatar by
// hitting Discord's REST API ourselves rather than relying on the
// gateway-listening bot, since this endpoint runs on Vercel.
//
// Request body:  { discordUserId: string }
// Response:      { ok: true, channelId, messageId }

const ANNOUNCEMENTS_CHANNEL_ID = '1295044213590982724'  // CHANNELS.ANNOUNCEMENTS in discord-bot/config.js
const BRAND_GOLD = 0xC9A96E

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { discordUserId } = await req.json() as { discordUserId?: string }
  if (!discordUserId || !/^\d{17,20}$/.test(discordUserId)) {
    return NextResponse.json({ error: 'discordUserId required (17-20 digit Discord snowflake)' }, { status: 400 })
  }

  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID ?? '1295044213360296048'  // mirrors discord-bot/config.js
  if (!botToken) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  // Resolve the member's display name + avatar. Try guild-member first
  // (gives us guild nickname if set); fall back to the global user
  // object if they're not in the guild yet for any reason.
  let displayName = 'friend'
  let avatarUrl: string | null = null

  try {
    const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    })
    if (memberRes.ok) {
      const m = await memberRes.json() as {
        nick?: string | null
        user?: { username?: string; global_name?: string | null; avatar?: string | null }
      }
      displayName = m.nick || m.user?.global_name || m.user?.username || displayName
      if (m.user?.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${discordUserId}/${m.user.avatar}.png?size=128`
      }
    } else {
      const userRes = await fetch(`https://discord.com/api/v10/users/${discordUserId}`, {
        headers: { Authorization: `Bot ${botToken}` },
      })
      if (userRes.ok) {
        const u = await userRes.json() as { username?: string; global_name?: string | null; avatar?: string | null }
        displayName = u.global_name || u.username || displayName
        if (u.avatar) {
          avatarUrl = `https://cdn.discordapp.com/avatars/${discordUserId}/${u.avatar}.png?size=128`
        }
      }
    }
  } catch {
    // Non-fatal — we'll just fall back to "friend" + no avatar.
  }

  const result = await sendChannelMessage(ANNOUNCEMENTS_CHANNEL_ID, {
    content: `<@${discordUserId}>`,
    allowedMentions: { parse: ['users'] },
    embeds: [{
      title: '🎉 New teammate just joined',
      description: `Everyone, please welcome **${displayName}** to the All Financial Freedom family.\n\nDrop a wave, say hi, share something useful — that's how we roll.`,
      color: BRAND_GOLD,
      thumbnail: avatarUrl ? { url: avatarUrl } : undefined,
      footer: { text: 'All Financial Freedom · Wealth · Protection · Legacy' },
      timestamp: new Date().toISOString(),
    }],
  })

  return NextResponse.json({
    ok: true,
    channelId: ANNOUNCEMENTS_CHANNEL_ID,
    messageId: result.id,
    resolvedName: displayName,
  })
}
