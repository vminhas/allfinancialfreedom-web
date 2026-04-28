import { db } from './db'
import { randomUUID } from 'crypto'
import { PHASE_ITEMS, CARRIERS } from './agent-constants'
import { getGhlConfig, sendGhlEmail, ghlPost } from './ghl'
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
  status: 'APPROVED' | 'ERROR' | 'INVALID' | 'CONFLICT'
  agentCode?: string
  profileId?: string
  emailSent?: boolean
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

  const existingUser = await db.agentUser.findUnique({ where: { email: referral.email } })
  if (existingUser) {
    return { ok: false, status: 'CONFLICT', error: 'An agent with this email already exists' }
  }

  // Generate a unique agent code (collisions extremely rare given the alphabet
  // size; 5 attempts is plenty).
  let agentCode = generateAgentCode()
  for (let i = 0; i < 5; i++) {
    const exists = await db.agentProfile.findUnique({ where: { agentCode } })
    if (!exists) break
    agentCode = generateAgentCode()
  }

  const referringAgent = await db.agentProfile.findUnique({
    where: { id: referral.referringAgentId },
    select: { agentCode: true, firstName: true, lastName: true },
  })

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
        })
        emailSent = msgRes.ok
      }
    }
  } catch {
    // swallow — caller decides what to surface
  }

  // Fire a celebration ping in the admin Discord channel — symmetrical to
  // the submission notification, and a permanent record of who approved
  // when. Fires regardless of whether approval came from the Discord button
  // or the vault UI; the Discord-button path also edits the original
  // embed in place but that's clicker feedback, this is the audit log.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('./discord')
      const refName = referringAgent
        ? `${referringAgent.firstName} ${referringAgent.lastName}`
        : null
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
