/**
 * Discord phase role management for AFF agents.
 *
 * When an admin advances an agent's phase in the vault tracker, this
 * module assigns the corresponding Discord role so the agent gets
 * access to the phase's training channels. The Railway bot detects
 * the role change via GuildMemberUpdate and sends the onboarding DM.
 *
 * Design: ADDITIVE — old phase roles are kept so agents can still
 * reference earlier training content. Only the new role is added.
 */

// Phase → Discord role ID mapping (from discord-bot/config.js)
// These are static server role IDs that don't change.
const PHASE_ROLE_IDS: Record<number, string> = {
  1: '1295044213372883020', // Phase 1 Step 1 (default entry point)
  2: '1295044213372883024', // Phase 2
  3: '1295044213372883025', // Phase 3
  4: '1300845918937157652', // Phase 4
}

// Phase 1 sub-step roles (for future granular assignment)
const PHASE_1_STEP_ROLES: Record<number, string> = {
  1: '1295044213372883020', // Step 1: Setup
  2: '1295044213372883021', // Step 2: Execution
  3: '1295044213372883022', // Step 3: Exam Prep
}

function getCredentials(): { guildId: string; botToken: string } | null {
  const guildId = process.env.DISCORD_GUILD_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!guildId || !botToken) return null
  return { guildId, botToken }
}

/**
 * Assign the Discord role for an agent's new phase.
 * ADDITIVE: only adds the new role, does not remove old phase roles.
 * If the agent hasn't connected Discord (no discordUserId), silently skips.
 */
export async function assignDiscordPhaseRole(
  discordUserId: string,
  newPhase: number,
  _oldPhase: number | null // kept for API compat but not used (additive model)
): Promise<boolean> {
  const creds = getCredentials()
  if (!creds) return false

  const newRoleId = PHASE_ROLE_IDS[newPhase]
  if (!newRoleId) return false

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${creds.guildId}/members/${discordUserId}/roles/${newRoleId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${creds.botToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return res.ok || res.status === 204
  } catch (err) {
    console.error('[discord-roles] Failed to assign phase role:', err)
    return false
  }
}

/**
 * Assign a Phase 1 sub-step role (Step 1, 2, or 3).
 * Called when granular sub-step progression is needed.
 */
export async function assignPhase1StepRole(
  discordUserId: string,
  step: 1 | 2 | 3
): Promise<boolean> {
  const creds = getCredentials()
  if (!creds) return false

  const roleId = PHASE_1_STEP_ROLES[step]
  if (!roleId) return false

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${creds.guildId}/members/${discordUserId}/roles/${roleId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${creds.botToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return res.ok || res.status === 204
  } catch (err) {
    console.error('[discord-roles] Failed to assign Phase 1 step role:', err)
    return false
  }
}

/**
 * Assign an arbitrary Discord role to a guild member.
 */
export async function assignDiscordRole(
  discordUserId: string,
  roleId: string
): Promise<boolean> {
  const creds = getCredentials()
  if (!creds) return false

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${creds.guildId}/members/${discordUserId}/roles/${roleId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${creds.botToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return res.ok || res.status === 204
  } catch {
    return false
  }
}

/**
 * Get the display name of the Discord role for a given phase.
 */
export async function getAgentDiscordRoleName(phase: number): Promise<string | null> {
  const creds = getCredentials()
  if (!creds) return null

  const roleId = PHASE_ROLE_IDS[phase]
  if (!roleId) return null

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${creds.guildId}/roles`, {
      headers: { Authorization: `Bot ${creds.botToken}` },
    })
    if (!res.ok) return null
    const roles = await res.json() as { id: string; name: string }[]
    return roles.find(r => r.id === roleId)?.name ?? null
  } catch {
    return null
  }
}
