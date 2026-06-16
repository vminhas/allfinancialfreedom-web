import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getGhlConfig, sendGhlEmail, ghlPost, OPS_MAILBOX } from '@/lib/ghl'
import { requireRole } from '@/lib/permissions'
import { wrapInShell } from '@/lib/email-template'

// POST /api/admin/agents/send-password-reset
//   body: { agentProfileId }
//
// Generates a fresh inviteToken on the AgentUser row and emails the
// agent a link to /agents/invite?token=... where they can set a new
// password (set-password overwrites passwordHash, so the same flow
// doubles as a reset). Distinct from /api/admin/agents/invite to keep
// the email copy clearly a password-reset, not a welcome.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as { agentProfileId?: string }
  if (!body.agentProfileId) {
    return NextResponse.json({ error: 'agentProfileId required' }, { status: 400 })
  }

  const profile = await db.agentProfile.findUnique({
    where: { id: body.agentProfileId },
    include: { agentUser: true },
  })
  if (!profile?.agentUser) {
    return NextResponse.json({ error: 'Agent has no portal account yet' }, { status: 404 })
  }
  if (profile.agentUser.email.endsWith('@aff.local')) {
    return NextResponse.json({ error: 'This is a tracking-only profile (no real email on file)' }, { status: 400 })
  }

  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000)
  await db.agentUser.update({
    where: { id: profile.agentUser.id },
    data: { inviteToken, inviteExpires },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const resetUrl = `${baseUrl}/agents/invite?token=${inviteToken}`

  let emailSent = false
  let emailError: string | null = null
  try {
    const config = await getGhlConfig()
    if (!config.apiKey || !config.locationId) {
      emailError = 'GHL not configured'
    } else {
      const searchRes = await fetch(
        `https://services.leadconnectorhq.com/contacts/search?locationId=${config.locationId}&query=${encodeURIComponent(profile.agentUser.email)}`,
        { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } },
      )
      const searchData = await searchRes.json() as { contacts?: { id: string }[] }
      let ghlContactId = searchData.contacts?.[0]?.id
      if (!ghlContactId) {
        const createRes = await ghlPost('/contacts/', {
          locationId: config.locationId,
          email: profile.agentUser.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone ?? undefined,
          tags: ['agent-portal'],
        }, config)
        const createData = await createRes.json() as { contact?: { id: string } }
        ghlContactId = createData.contact?.id
      }

      if (ghlContactId) {
        const html = wrapInShell({
          title: 'Reset Your Password',
          preheader: 'Reset your AFF agent portal password',
          senderName: 'AFF Operations',
          senderRole: 'All Financial Freedom',
          bodyHtml: `
            <p style="font-size:16px;line-height:1.6;color:#142D48;margin:0 0 18px">Hi ${profile.firstName},</p>
            <p style="font-size:15px;line-height:1.6;color:#142D48;margin:0 0 18px">
              We received a request to reset your All Financial Freedom agent portal password.
              Click the button below to choose a new one. This link is valid for 72 hours.
            </p>
            <p style="text-align:center;margin:28px 0">
              <a href="${resetUrl}" style="display:inline-block;background:#C9A96E;color:#142D48;text-decoration:none;padding:14px 28px;border-radius:4px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;font-size:13px">Reset Password</a>
            </p>
            <p style="font-size:13px;line-height:1.6;color:#6B8299;margin:0 0 6px">
              If the button does not work, paste this link into your browser:
            </p>
            <p style="font-size:12px;line-height:1.5;color:#6B8299;word-break:break-all;margin:0 0 18px">
              ${resetUrl}
            </p>
            <p style="font-size:13px;line-height:1.6;color:#6B8299;margin:0">
              If you did not request this reset, you can ignore this email and your current password will stay active.
            </p>
          `,
        })
        const msgRes = await sendGhlEmail({
          contactId: ghlContactId,
          emailTo: profile.agentUser.email,
          subject: 'Reset your AFF agent portal password',
          html,
          config,
          emailFrom: OPS_MAILBOX.email,
          emailFromName: OPS_MAILBOX.name,
        })
        emailSent = msgRes.ok
        if (!msgRes.ok) {
          const t = await msgRes.text()
          emailError = `GHL error ${msgRes.status}: ${t.slice(0, 200)}`
        }
      } else {
        emailError = 'Could not find or create GHL contact'
      }
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : 'Email send failed'
  }

  return NextResponse.json({ ok: emailSent, emailSent, emailError, email: profile.agentUser.email })
}
