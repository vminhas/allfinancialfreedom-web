import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getGhlConfig, sendGhlEmail, ghlPost, OPS_MAILBOX } from '@/lib/ghl'
import { ensureTeamTagOnContact } from '@/lib/ghl-team-tag'
import { buildWelcomeEmailHtml } from '@/lib/welcome-email'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/agents/invite — send/resend invite email for an agent
// Both admins and licensing coordinators can invite (LC onboards new agents too)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { agentUserId } = await req.json() as { agentUserId: string }
  if (!agentUserId) return NextResponse.json({ error: 'agentUserId required' }, { status: 400 })

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
      } else {
        emailError = 'Could not find or create GHL contact'
      }
    } else {
      emailError = 'GHL not configured'
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : 'Email send failed'
  }

  return NextResponse.json({ ok: true, agentName, emailSent, emailError })
}
