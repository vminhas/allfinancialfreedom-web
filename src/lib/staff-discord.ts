// Direct-message helpers for staff (admins + licensing coordinators).
// Pairs with the channel-side coordinator-discord.ts: channel posts
// keep the team in the loop, DMs ping the specific person who
// needs to act on it.
//
// Connection state lives on AdminUser.discordUserId; populated via
// the /vault/settings -> Connect Discord OAuth flow.

import { db } from './db'

async function dmDiscordUser(discordUserId: string, embed: Record<string, unknown>): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  try {
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: discordUserId }),
    })
    if (!dmRes.ok) return
    const dm = await dmRes.json() as { id: string }
    const { sendChannelMessage } = await import('./discord')
    await sendChannelMessage(dm.id, { embeds: [embed as never] })
  } catch (err) {
    console.warn('[staff-discord] DM failed:', err)
  }
}

// DM every licensing coordinator with a linked Discord. Used for
// new-business submissions and licensing-ticket creates where the
// LC team broadly needs to see it land. Non-blocking — caller can
// fire-and-forget.
export async function dmLicensingCoordinators(embed: Record<string, unknown>): Promise<number> {
  const coordinators = await db.adminUser.findMany({
    where: { role: 'LICENSING_COORDINATOR', discordUserId: { not: null } },
    select: { discordUserId: true },
  })
  let sent = 0
  for (const c of coordinators) {
    if (!c.discordUserId) continue
    await dmDiscordUser(c.discordUserId, embed)
    sent++
  }
  return sent
}

// DM a specific admin user (e.g. the coordinator assigned to a
// particular ticket / submission). Falls back to dmLicensingCoordinators
// when adminUserId is null so unassigned items still reach somebody.
export async function dmAdminUser(
  adminUserId: string | null,
  embed: Record<string, unknown>,
): Promise<void> {
  if (!adminUserId) {
    await dmLicensingCoordinators(embed)
    return
  }
  const user = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { discordUserId: true, role: true },
  })
  if (!user) return
  if (user.discordUserId) {
    await dmDiscordUser(user.discordUserId, embed)
    return
  }
  // Assignee hasn't linked Discord yet → broadcast to the team so
  // the work doesn't sit silently while we wait on them.
  await dmLicensingCoordinators(embed)
}
