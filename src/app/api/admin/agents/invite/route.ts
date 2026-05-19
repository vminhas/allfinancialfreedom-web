import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getGhlConfig, sendGhlEmail, sendGhlSms, ghlPost, OPS_MAILBOX } from '@/lib/ghl'
import { ensureTeamTagOnContact } from '@/lib/ghl-team-tag'
import { buildWelcomeEmailHtml } from '@/lib/welcome-email'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/agents/invite — send/resend the portal invite for an
// agent by email, SMS text, or both. Body: { agentUserId, channel }
// where channel is 'email' (default), 'sms', or 'both'. Both admins and
// licensing coordinators can invite (LC onboards new agents too).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as { agentUserId?: string; channel?: 'email' | 'sms' | 'both' }
  const agentUserId = body.agentUserId
  const channel = body.channel ?? 'email'
  if (!agentUserId) return NextResponse.json({ error: 'agentUserId required' }, { status: 400 })
  if (!['email', 'sms', 'both'].includes(channel)) {
    return NextResponse.json({ error: 'channel must be email, sms, or both' }, { status: 400 })
  }
  const wantEmail = channel === 'email' || channel === 'both'
  const wantSms = channel === 'sms' || channel === 'both'

  const agentUser = await db.agentUser.findUnique({
    where: { id: agentUserId },
    include: { profile: true },
  })
  if (!agentUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fresh invite token valid for 72 hours
  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000)

  await db.agentUser.update({
    where: { id: agentUserId },
    data: { inviteToken, inviteExpires },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const inviteUrl = `${baseUrl}/agents/invite?token=${inviteToken}`
  const agentName = agentUser.profile
    ? `${agentUser.profile.firstName} ${agentUser.profile.lastName}`
    : agentUser.email

  // Send via GHL
  let emailSent = false
  let emailError: string | null = null
  let smsSent = false
  let smsError: string | null = null
  try {
    const config = await getGhlConfig()
    if (config.apiKey && config.locationId) {
      // Look up GHL contact by email
      const searchRes = await fetch(
        `https://services.leadconnectorhq.com/contacts/search?locationId=${config.locationId}&query=${encodeURIComponent(agentUser.email)}`,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Version: '2021-07-28',
          },
        }
      )
      const searchData = await searchRes.json() as { contacts?: { id: string }[] }
      let ghlContactId = searchData.contacts?.[0]?.id

      // Create GHL contact if not found
      if (!ghlContactId && agentUser.profile) {
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

      if (ghlContactId) {
        // Tag as AFF Team Member for smart-list / workflow targeting.
        // Non-destructive (keeps existing tags) and non-blocking — don't
        // fail the invite if tagging fails.
        await ensureTeamTagOnContact(ghlContactId, config).catch(() => {})

        const firstName = agentUser.profile?.firstName ?? 'Agent'

        if (wantEmail) {
          const html = await buildWelcomeEmailHtml({ firstName, inviteUrl })
          const msgRes = await sendGhlEmail({
            contactId: ghlContactId,
            emailTo: agentUser.email,
            subject: 'Welcome to the All Financial Freedom family',
            html,
            config,
            // Welcome emails come from operations@, not the CEO mailbox.
            // The body is signed by Natalia and reply-to lands with the
            // people who actually onboard the new agent.
            emailFrom: OPS_MAILBOX.email,
            emailFromName: OPS_MAILBOX.name,
          })
          emailSent = msgRes.ok
          if (!msgRes.ok) {
            const errBody = await msgRes.text()
            emailError = `GHL error ${msgRes.status}: ${errBody.slice(0, 200)}`
          }
        }

        if (wantSms) {
          if (!agentUser.profile?.phone) {
            smsError = 'No phone number on this agent profile'
          } else {
            const message =
              `${firstName}, welcome to All Financial Freedom. ` +
              `Set up your agent portal here (link expires in 72 hours): ${inviteUrl}`
            const smsRes = await sendGhlSms({ contactId: ghlContactId, message, config })
            smsSent = smsRes.ok
            if (!smsRes.ok) {
              const errBody = await smsRes.text()
              smsError = `GHL error ${smsRes.status}: ${errBody.slice(0, 200)}`
            }
          }
        }
      } else {
        const msg = 'Could not find or create GHL contact'
        if (wantEmail) emailError = msg
        if (wantSms) smsError = msg
      }
    } else {
      const msg = 'GHL not configured'
      if (wantEmail) emailError = msg
      if (wantSms) smsError = msg
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invite send failed'
    if (wantEmail) emailError = msg
    if (wantSms) smsError = msg
  }

  return NextResponse.json({ ok: true, agentName, emailSent, emailError, smsSent, smsError })
}
