// Shared "celebrate a new agent joining AFF" helper.
//
// Posts the public NEW BUSINESS PARTNER card to #announcements for a
// given AgentProfile id. Looks up the recruiter (via the profile's
// recruiterId, which stores the recruiter's agentCode) so the embed
// can render the recruiter as the protagonist and tag them.
//
// Three callers today:
//   - approveReferral() — when a portal referral is approved
//   - Tevah sync — when a new agent comes back from the supervision
//     platform and we create the row locally
//   - POST /api/admin/agents/[id]/announce-join — manual re-fire from
//     the vault tracker for backfills (rare)
//
// All three want the same visual: the recruiter is the visual subject
// (their avatar is the embed thumbnail, their name is the headline),
// the new agent's name lives in the fields. This mirrors what the CEO
// wanted: the recruiter shared the opportunity, the new agent is the
// guest of honor in the body.
//
// Non-fatal throughout: a missing Discord token or channel just
// returns ok=false; the row already exists, the celebration is
// optional. Errors are logged but never thrown — callers running
// inside a fire-and-forget Promise.catch don't want a swallowed
// exception.

import { db } from './db'

export interface CelebrateInput {
  agentProfileId: string
}

export interface CelebrateResult {
  ok: boolean
  reason?: 'no_token' | 'no_profile' | 'no_recruiter' | 'send_failed'
  recruiterAgentCode?: string
  newAgentName?: string
}

export async function celebrateNewBusinessPartner(
  input: CelebrateInput,
): Promise<CelebrateResult> {
  if (!process.env.DISCORD_BOT_TOKEN) {
    return { ok: false, reason: 'no_token' }
  }

  const newAgent = await db.agentProfile.findUnique({
    where: { id: input.agentProfileId },
    select: {
      firstName: true,
      lastName: true,
      preferredName: true,
      state: true,
      recruiterId: true,
    },
  })
  if (!newAgent) return { ok: false, reason: 'no_profile' }

  // recruiterId stores the recruiter's agentCode (per CLAUDE.md);
  // resolve it to the recruiter's profile so we can render the embed.
  const recruiter = newAgent.recruiterId
    ? await db.agentProfile.findUnique({
        where: { agentCode: newAgent.recruiterId },
        select: {
          agentCode: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          avatarUrl: true,
          discordUserId: true,
        },
      })
    : null
  if (!recruiter) {
    // No recruiter on file (e.g. self-recruited via the public site,
    // or Tevah didn't ship a reference). Skip — the public card needs
    // a protagonist who shared the opportunity.
    return {
      ok: false,
      reason: 'no_recruiter',
      newAgentName: `${newAgent.firstName} ${newAgent.lastName}`.trim(),
    }
  }

  const { sendChannelMessage } = await import('./discord')
  const { buildAchievementEmbed } = await import('./discord-card')
  const { displayFullName } = await import('./display-name')
  const announcementsChannel =
    process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
  const refName = displayFullName(recruiter)
  const newAgentName = displayFullName(newAgent)
  const recruiterMention = recruiter.discordUserId
    ? `<@${recruiter.discordUserId}>`
    : `**${refName}**`

  const card = buildAchievementEmbed({
    flavor: 'NEW_RECRUIT',
    protagonist: {
      firstName: recruiter.firstName,
      lastName: recruiter.lastName,
      preferredName: recruiter.preferredName,
      agentCode: recruiter.agentCode,
      avatarUrl: recruiter.avatarUrl,
    },
    subline: `Welcome **${newAgentName}** to the AFF family.`,
    fields: [
      { name: 'New Business Partner', value: newAgentName, inline: true },
      { name: 'State', value: newAgent.state ?? 'Not set', inline: true },
      { name: 'Shared by', value: `${refName} (\`${recruiter.agentCode}\`)`, inline: false },
    ],
  })

  try {
    await sendChannelMessage(announcementsChannel, {
      content: `${recruiterMention} shared the opportunity with **${newAgentName}**.`,
      embeds: [card],
    })
    return {
      ok: true,
      recruiterAgentCode: recruiter.agentCode,
      newAgentName,
    }
  } catch (err) {
    console.error('[celebrateNewBusinessPartner] send failed:', err)
    return { ok: false, reason: 'send_failed' }
  }
}
