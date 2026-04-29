import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getGhlConfig, sendGhlEmail, ghlPost, OPS_MAILBOX } from '@/lib/ghl'
import { buildWelcomeEmailHtml } from '@/lib/welcome-email'

// POST /api/agents/team/resend-invite — agent reissues the welcome email
// for one of their own recruits whose portal hasn't been activated yet.
//
// Auth: agent session + ownership check (target's recruiterId must equal
// the calling agent's agentCode). Pending referrals (no AgentUser yet)
// are rejected — those are still awaiting admin approval.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }
  const me = await db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { agentCode: true },
  })
  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { agentUserId } = await req.json() as { agentUserId?: string }
  if (!agentUserId) return NextResponse.json({ error: 'agentUserId required' }, { status: 400 })

  const target = await db.agentUser.findUnique({
    where: { id: agentUserId },
    include: { profile: true },
  })
  if (!target?.profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Ownership: caller must be the recruiter of this agent.
  if (target.profile.recruiterId !== me.agentCode) {
    return NextResponse.json({ error: 'You can only resend invites for your own team' }, { status: 403 })
  }

  // Already activated — nothing to resend.
  if (target.passwordHash) {
    return NextResponse.json({ error: 'This agent has already activated their portal' }, { status: 400 })
  }

  // Fresh 72-hour invite token.
  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000)
  await db.agentUser.update({
    where: { id: agentUserId },
    data: { inviteToken, inviteExpires },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const inviteUrl = `${baseUrl}/agents/invite?token=${inviteToken}`

  let emailSent = false
  let emailError: string | null = null
  try {
    const config = await getGhlConfig()
    if (!config.apiKey || !config.locationId) {
      emailError = 'GHL not configured'
    } else {
      // Reuse the existing contact when we can; create one only if missing.
      const searchRes = await fetch(
        `https://services.leadconnectorhq.com/contacts/search?locationId=${config.locationId}&query=${encodeURIComponent(target.email)}`,
        { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } }
      )
      const searchData = await searchRes.json() as { contacts?: { id: string }[] }
      let ghlContactId = searchData.contacts?.[0]?.id
      if (!ghlContactId) {
        const createRes = await ghlPost('/contacts/', {
          locationId: config.locationId,
          email: target.email,
          firstName: target.profile.firstName,
          lastName: target.profile.lastName,
          phone: target.profile.phone ?? undefined,
          tags: ['agent-portal', 'AFF Team Member'],
        }, config)
        const createData = await createRes.json() as { contact?: { id: string } }
        ghlContactId = createData.contact?.id
      }

      if (ghlContactId) {
        const html = await buildWelcomeEmailHtml({
          firstName: target.profile.firstName,
          inviteUrl,
          referredByName: null,
        })
        const msgRes = await sendGhlEmail({
          contactId: ghlContactId,
          emailTo: target.email,
          subject: 'Welcome to the All Financial Freedom family',
          html,
          config,
          // Welcome emails come from operations@, not the CEO mailbox.
          emailFrom: OPS_MAILBOX.email,
          emailFromName: OPS_MAILBOX.name,
        })
        emailSent = msgRes.ok
        if (!msgRes.ok) emailError = `GHL error ${msgRes.status}`
      } else {
        emailError = 'Could not find or create GHL contact'
      }
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : 'Email send failed'
  }

  return NextResponse.json({ ok: emailSent, emailSent, emailError })
}
