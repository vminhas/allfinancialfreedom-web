import { db } from './db'
import { randomUUID } from 'crypto'
import { PHASE_ITEMS, CARRIERS } from './agent-constants'
import { getGhlConfig, sendGhlEmail, ghlPost, OPS_MAILBOX } from './ghl'
import { buildWelcomeEmailHtml } from './welcome-email'

// Shared approval flow used by both the vault PATCH endpoint and the Discord
// approve-button interaction. Creates the AgentUser + AgentProfile, marks the
// referral APPROVED, and best-effort fires the GHL welcome email. Returns
// enough info for the caller to render success copy or surface failures.

export interface ApprovalInput {
  referralId: string
  approvedById: string  // AdminUser.id, or a free-form identifier (e.g. discord username)
  cft?: string | null   // optional trainer name to attach to the new profile
  approvedByLabel?: string  // human-readable name shown in the Discord ping ("Vick Minhas", "Natalia")
}

export interface ApprovalResult {
  ok: boolean
  status: 'APPROVED' | 'LINKED' | 'ERROR' | 'INVALID' | 'CONFLICT'
  agentCode?: string
  profileId?: string
  emailSent?: boolean
  // True when approval linked the referral to an agent that already
  // existed in the system (ICA flow / earlier admin add) rather than
  // creating a new one. UI uses this to suppress the "Welcome email
  // is on its way" copy because the welcome already went out.
  linkedExisting?: boolean
  error?: string
}

function generateAgentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'AFF'
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function approveReferral(input: ApprovalInput): Promise<ApprovalResult> {
  const referral = await db.agentReferral.findUnique({ where: { id: input.referralId } })
  if (!referral) return { ok: false, status: 'INVALID', error: 'Referral not found' }
  if (referral.status !== 'PENDING') {
    return { ok: false, status: 'CONFLICT', error: `Already processed (${referral.status})` }
  }

  const referringAgent = await db.agentProfile.findUnique({
    where: { id: referral.referringAgentId },
    select: {
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      avatarUrl: true,
      discordUserId: true,
    },
  })

  // Already-in-the-system case. Happens when the recruit landed in our
  // database through a different path (ICA submission auto-approved,
  // admin "add agent" form, etc.) AFTER the referral row was created
  // here. We don't want approval to be a dead-end — link the referral
  // to the existing agent so the recruiter gets downline credit and
  // the row stops blocking the queue.
  const existingUser = await db.agentUser.findUnique({
    where: { email: referral.email },
    include: { profile: { select: { id: true, agentCode: true, recruiterId: true } } },
  })
  if (existingUser) {
    if (!existingUser.profile) {
      return {
        ok: false,
        status: 'ERROR',
        error: 'An AgentUser already exists for this email but has no profile. Reconcile manually before approving.',
      }
    }

    // Credit the recruiter on the existing profile if and only if it
    // has no recruiter yet. We don't overwrite a different recruiter
    // silently — that should be a deliberate admin reassignment via
    // the org tree, not a side-effect of approving a referral.
    const recruiterAlreadySet =
      existingUser.profile.recruiterId && existingUser.profile.recruiterId !== referringAgent?.agentCode
    if (!existingUser.profile.recruiterId && referringAgent?.agentCode) {
      await db.agentProfile.update({
        where: { id: existingUser.profile.id },
        data: { recruiterId: referringAgent.agentCode },
      })
    }

    await db.agentReferral.update({
      where: { id: input.referralId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: input.approvedById,
        createdAgentId: existingUser.profile.id,
      },
    })

    // Admin-channel audit note. Public NEW_RECRUIT celebration is
    // skipped intentionally — the agent already exists, the team
    // doesn't need to be told "welcome" again.
    if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
      try {
        const { sendChannelMessage } = await import('./discord')
        const { displayFullName } = await import('./display-name')
        const refName = referringAgent ? displayFullName(referringAgent) : null
        const approverLabel = input.approvedByLabel ?? 'admin'
        sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
          embeds: [{
            title: '🔗 Referral linked to existing agent',
            description: [
              `**${referral.firstName} ${referral.lastName}** was already in the system.`,
              '',
              `Linked to: \`${existingUser.profile.agentCode}\``,
              recruiterAlreadySet
                ? `Recruiter on file: \`${existingUser.profile.recruiterId}\` (not changed${refName ? `; referral from ${refName} also recorded` : ''})`
                : refName ? `Recruiter credit: ${refName}` : '',
              `Approved by: ${approverLabel}`,
            ].filter(Boolean).join('\n'),
            color: 0x60a5fa,
            timestamp: new Date().toISOString(),
            footer: { text: 'AFF Concierge · Approvals' },
          }],
        }).catch(() => {})
      } catch { /* non-fatal */ }
    }

    return {
      ok: true,
      status: 'LINKED',
      agentCode: existingUser.profile.agentCode,
      profileId: existingUser.profile.id,
      emailSent: false,
      linkedExisting: true,
    }
  }

  // Generate a unique agent code (collisions extremely rare given the alphabet
  // size; 5 attempts is plenty).
  let agentCode = generateAgentCode()
  for (let i = 0; i < 5; i++) {
    const exists = await db.agentProfile.findUnique({ where: { agentCode } })
    if (!exists) break
    agentCode = generateAgentCode()
  }

  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000)

  let profileId: string | undefined
  try {
    const agentUser = await db.agentUser.create({
      data: {
        email: referral.email,
        inviteToken,
        inviteExpires,
        profile: {
          create: {
            agentCode,
            firstName: referral.firstName,
            lastName: referral.lastName,
            state: referral.state,
            phone: referral.phone,
            recruiterId: referringAgent?.agentCode,
            cft: input.cft ?? undefined,
            phase: 1,
            phaseStartedAt: new Date(),
            phaseItems: {
              create: PHASE_ITEMS[1].map(item => ({
                phase: 1,
                itemKey: item.key,
                completed: false,
              })),
            },
            carrierAppointments: {
              create: CARRIERS.map(carrier => ({
                carrier,
                status: 'NOT_STARTED',
              })),
            },
          },
        },
      },
      include: { profile: true },
    })
    profileId = agentUser.profile?.id

    await db.agentReferral.update({
      where: { id: input.referralId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: input.approvedById,
        createdAgentId: profileId,
      },
    })
  } catch (err) {
    return {
      ok: false,
      status: 'ERROR',
      error: err instanceof Error ? err.message : 'Failed to create agent',
    }
  }

  // Send the welcome email via GHL. Non-fatal — agent already exists in the
  // DB, the email can be re-sent from the My Team tab if it fails here.
  let emailSent = false
  try {
    const config = await getGhlConfig()
    if (config.apiKey && config.locationId) {
      const createRes = await ghlPost('/contacts/', {
        locationId: config.locationId,
        email: referral.email,
        firstName: referral.firstName,
        lastName: referral.lastName,
        phone: referral.phone ?? undefined,
        tags: ['agent-portal', 'AFF Team Member'],
      }, config)
      const createData = await createRes.json() as { contact?: { id: string } }
      const ghlContactId = createData.contact?.id
      if (ghlContactId) {
        const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
        const inviteUrl = `${baseUrl}/agents/invite?token=${inviteToken}`
        const referredByName = referringAgent
          ? `${referringAgent.firstName} ${referringAgent.lastName}`
          : null
        const html = await buildWelcomeEmailHtml({
          firstName: referral.firstName,
          inviteUrl,
          referredByName,
        })
        const msgRes = await sendGhlEmail({
          contactId: ghlContactId,
          emailTo: referral.email,
          subject: 'Welcome to the All Financial Freedom family',
          html,
          config,
          // Welcome emails come from operations@, not the CEO mailbox.
          emailFrom: OPS_MAILBOX.email,
          emailFromName: OPS_MAILBOX.name,
        })
        emailSent = msgRes.ok
      }
    }
  } catch {
    // swallow — caller decides what to surface
  }

  // Public-facing celebration in #announcements — gated on approval so we
  // don't celebrate a recruit that staff hasn't reviewed yet. Fires from
  // both the Discord approve-button path and the vault UI approve path
  // because both flow through here.
  if (process.env.DISCORD_BOT_TOKEN && referringAgent) {
    try {
      const { sendChannelMessage } = await import('./discord')
      const { buildAchievementEmbed } = await import('./discord-card')
      const { displayFullName } = await import('./display-name')
      const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
      const refName = displayFullName(referringAgent)
      const recruitName = `${referral.firstName} ${referral.lastName}`
      const recruiterMention = referringAgent.discordUserId
        ? `<@${referringAgent.discordUserId}>`
        : `**${refName}**`
      const card = buildAchievementEmbed({
        flavor: 'NEW_RECRUIT',
        protagonist: {
          firstName: referringAgent.firstName,
          lastName: referringAgent.lastName,
          preferredName: referringAgent.preferredName,
          agentCode: referringAgent.agentCode,
          avatarUrl: referringAgent.avatarUrl,
        },
        subline: `Welcome **${recruitName}** to the AFF family.`,
        fields: [
          { name: 'Recruit', value: recruitName, inline: true },
          { name: 'State', value: referral.state ?? 'Not set', inline: true },
          { name: 'Recruited by', value: `${refName} (\`${referringAgent.agentCode}\`)`, inline: false },
        ],
      })
      sendChannelMessage(announcementsChannel, {
        content: `${recruiterMention} brought a new agent to the team! Let's go!`,
        embeds: [card],
      }).catch((err) => {
        console.error('[approveReferral] public announcement failed:', err)
      })
    } catch (err) {
      console.error('[approveReferral] public announcement threw:', err)
    }
  }

  // Fire a celebration ping in the admin Discord channel — symmetrical to
  // the submission notification, and a permanent record of who approved
  // when. Fires regardless of whether approval came from the Discord button
  // or the vault UI; the Discord-button path also edits the original
  // embed in place but that's clicker feedback, this is the audit log.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('./discord')
      const { displayFullName } = await import('./display-name')
      const refName = referringAgent ? displayFullName(referringAgent) : null
      const approverLabel = input.approvedByLabel ?? 'admin'
      sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: '🎉 New Agent Approved',
          description: [
            `**${referral.firstName} ${referral.lastName}** is in.`,
            '',
            `Agent code: \`${agentCode}\``,
            input.cft ? `Trainer: ${input.cft}` : '',
            refName ? `Referred by: ${refName}` : '',
            `Approved by: ${approverLabel}`,
            '',
            emailSent ? '_Welcome email sent_' : '_Welcome email did not confirm — re-send from My Team if needed_',
          ].filter(Boolean).join('\n'),
          color: 0x4ADE80,
          timestamp: new Date().toISOString(),
          footer: { text: 'AFF Concierge · Approvals' },
        }],
      }).catch(() => {})
    } catch { /* non-fatal */ }
  }

  return { ok: true, status: 'APPROVED', agentCode, profileId, emailSent }
}
