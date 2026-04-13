import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getGhlConfig, sendGhlEmail, ghlPost, ghlPut } from '@/lib/ghl'

// POST /api/admin/agents/invite — resend invite email for an agent
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
        // Tag the contact as an AFF team member for smart list targeting
        await ghlPut(`/contacts/${ghlContactId}`, {
          tags: ['AFF Team Member', 'agent-portal'],
        }, config).catch(() => {}) // non-blocking — don't fail the invite if tagging fails

        const firstName = agentUser.profile?.firstName ?? 'Agent'
        const agentCode = agentUser.profile?.agentCode ?? ''
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #0C1E30; color: #ffffff; border-radius: 8px;">
            <h2 style="color: #C9A96E; margin-bottom: 8px;">Welcome to All Financial Freedom</h2>
            <p style="color: #9BB0C4;">Hi ${firstName},</p>
            <p style="color: #9BB0C4;">Your agent portal is ready. Click the button below to set your password and access your <strong style="color:#C9A96E;">Agent Progression Tracker</strong> — where you can track your phases, carrier appointments, and milestones.</p>
            <a href="${inviteUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #C9A96E; color: #142D48; font-weight: 700; text-decoration: none; border-radius: 4px; font-size: 15px;">
              Set Up Your Portal →
            </a>
            <p style="color: #6B8299; font-size: 13px;">This link expires in 72 hours. If you need assistance, contact your trainer.</p>
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0;" />
            <p style="color: #4B5563; font-size: 11px; margin: 0;">All Financial Freedom${agentCode ? ` · Agent Code: ${agentCode}` : ''}</p>
          </div>
        `
        const msgRes = await sendGhlEmail({
          contactId: ghlContactId,
          emailTo: agentUser.email,
          subject: 'Welcome to All Financial Freedom — Set Up Your Portal',
          html,
          config,
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
