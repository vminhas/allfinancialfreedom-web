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

// Representative role: every connected AFF agent gets this. The role
// itself carries permissions the CEO configures in Discord (e.g.
// 'Change Nickname'), so granting it is how we enable agents to
// rename themselves without giving them broader server perms.
export const REPRESENTATIVE_ROLE_ID = '1295044213372883017'

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
 * Add the user to the AFF Discord guild using their OAuth access token.
 *
 * Requires the OAuth flow to have requested the `guilds.join` scope and
 * the bot to hold CREATE_INSTANT_INVITE permission in the guild. Discord
 * returns 201 when the user is newly added and 204 when they were
 * already a member, so both count as success. Discord refuses to add
 * accounts without a verified email/phone (returns 4xx): the caller
 * treats that as a soft failure and falls back to a manual invite.
 */
export async function addDiscordGuildMember(
  discordUserId: string,
  accessToken: string
): Promise<boolean> {
  const creds = getCredentials()
  if (!creds) return false

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${creds.guildId}/members/${discordUserId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${creds.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      }
    )
    if (res.ok || res.status === 204) return true
    // Log the status/body so the "unverified email/phone" refusal (a 4xx)
    // is visible in logs instead of vanishing as a silent soft-failure.
    const body = await res.text().catch(() => '')
    console.warn(`[discord-roles] guild join not OK: status=${res.status} body=${body.slice(0, 200)}`)
    return false
  } catch (err) {
    console.error('[discord-roles] Failed to add guild member:', err)
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
