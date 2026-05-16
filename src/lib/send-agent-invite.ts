// Sends the welcome / portal-setup invite email to a newly created agent.
// Shared by the admin manual-invite flow and the Tevah sync auto-invite.
// Uses the same GHL email path as the invite route so the two stay in sync.

import { randomUUID } from 'crypto'
import { db } from './db'
import { getGhlConfig, sendGhlEmail, ghlPost, OPS_MAILBOX } from './ghl'
import { ensureTeamTagOnContact } from './ghl-team-tag'
import { buildWelcomeEmailHtml } from './welcome-email'

export async function sendAgentInviteEmail(agentUserId: string): Promise<{ emailSent: boolean; emailError: string | null }> {
  const agentUser = await db.agentUser.findUnique({
    where: { id: agentUserId },
    include: { profile: true },
  })
  if (!agentUser || !agentUser.profile) return { emailSent: false, emailError: 'Agent not found' }

  // Don't send invites to synthetic @aff.local addresses (tracking-only profiles).
  if (agentUser.email.endsWith('@aff.local')) return { emailSent: false, emailError: null }

  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000)

  await db.agentUser.update({
    where: { id: agentUserId },
    data: { inviteToken, inviteExpires },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const inviteUrl = `${baseUrl}/agents/invite?token=${inviteToken}`
  const firstName = agentUser.profile.firstName

  try {
    const config = await getGhlConfig()
    if (!config.apiKey || !config.locationId) return { emailSent: false, emailError: 'GHL not configured' }

    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/search?locationId=${config.locationId}&query=${encodeURIComponent(agentUser.email)}`,
      { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } },
    )
    const searchData = await searchRes.json() as { contacts?: { id: string }[] }
    let ghlContactId = searchData.contacts?.[0]?.id

    if (!ghlContactId) {
      const createRes = await ghlPost('/contacts/', {
        locationId: config.locationId,
        email: agentUser.email,
        firstName: agentUser.profile.firstName,
        lastName: agentUser.profile.lastName,
        phone: agentUser.profile.phone ?? undefined,
        tags: ['agent-portal'],
      }, config)
      const createData = await createRes.json() as { contact?: { id: string } }
      ghlContactId = createData.contact?.id
    }

    if (!ghlContactId) return { emailSent: false, emailError: 'Could not find or create GHL contact' }

    // Non-destructive: appends the AFF Team Member tag, keeps existing
    // tags. Non-blocking — never fail the invite over tagging.
    await ensureTeamTagOnContact(ghlContactId, config).catch(() => {})

    const html = await buildWelcomeEmailHtml({ firstName, inviteUrl })
    const msgRes = await sendGhlEmail({
      contactId: ghlContactId,
      emailTo: agentUser.email,
      subject: 'Welcome to the All Financial Freedom family',
      html,
      config,
      emailFrom: OPS_MAILBOX.email,
      emailFromName: OPS_MAILBOX.name,
    })

    if (!msgRes.ok) {
      const errBody = await msgRes.text()
      return { emailSent: false, emailError: `GHL error ${msgRes.status}: ${errBody.slice(0, 200)}` }
    }

    return { emailSent: true, emailError: null }
  } catch (err) {
    return { emailSent: false, emailError: err instanceof Error ? err.message : String(err) }
  }
}
