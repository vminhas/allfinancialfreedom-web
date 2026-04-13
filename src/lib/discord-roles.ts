import { getSetting } from './settings'
import { DISCORD_PHASE_ROLE_KEYS, DISCORD_GUILD_ID_KEY, DISCORD_BOT_TOKEN_KEY } from './agent-constants'

// Assign a Discord role for the agent's new phase and remove the old one
export async function assignDiscordPhaseRole(
  discordUserId: string,
  newPhase: number,
  oldPhase: number | null
) {
  const [guildId, botToken, ...roleIds] = await Promise.all([
    getSetting(DISCORD_GUILD_ID_KEY),
    getSetting(DISCORD_BOT_TOKEN_KEY),
    ...DISCORD_PHASE_ROLE_KEYS.map(k => getSetting(k)),
  ])

  if (!guildId || !botToken) return

  const headers = {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  }

  // Add new phase role
  const newRoleId = roleIds[newPhase - 1]
  if (newRoleId) {
    await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${newRoleId}`,
      { method: 'PUT', headers }
    )
  }

  // Remove old phase role
  if (oldPhase && oldPhase !== newPhase) {
    const oldRoleId = roleIds[oldPhase - 1]
    if (oldRoleId) {
      await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${oldRoleId}`,
        { method: 'DELETE', headers }
      )
    }
  }
}

// Get the display name of an agent's current Discord role
export async function getAgentDiscordRoleName(phase: number): Promise<string | null> {
  const roleId = await getSetting(DISCORD_PHASE_ROLE_KEYS[phase - 1])
  if (!roleId) return null
  const guildId = await getSetting(DISCORD_GUILD_ID_KEY)
  const botToken = await getSetting(DISCORD_BOT_TOKEN_KEY)
  if (!guildId || !botToken) return null

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${botToken}` },
  })
  if (!res.ok) return null
  const roles = await res.json() as { id: string; name: string }[]
  return roles.find(r => r.id === roleId)?.name ?? null
}
