import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getSetting } from '@/lib/settings'

// POST /api/admin/agents/invite — resend invite email for an agent
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentUserId } = await req.json() as { agentUserId: string }
  if (!agentUserId) return NextResponse.json({ error: 'agentUserId required' }, { status: 400 })

  const agentUser = await db.agentUser.findUnique({
    where: { id: agentUserId },
    include: { profile: true },
  })
  if (!agentUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  // Send via GHL email
  const ghlApiKey = await getSetting('GHL_PRIVATE_KEY')
  const ghlLocationId = await getSetting('GHL_LOCATION_ID')

  if (ghlApiKey && ghlLocationId && agentUser.profile?.firstName) {
    // First find or create GHL contact for the agent
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${ghlLocationId}&email=${encodeURIComponent(agentUser.email)}`,
      { headers: { Authorization: `Bearer ${ghlApiKey}`, Version: '2021-07-28' } }
    )
    const searchData = await searchRes.json() as { contacts?: { id: string }[] }
    const ghlContactId = searchData.contacts?.[0]?.id

    if (ghlContactId) {
      const emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #0C1E30; color: #ffffff; border-radius: 8px;">
          <h2 style="color: #C9A96E; margin-bottom: 8px;">Welcome to All Financial Freedom</h2>
          <p style="color: #9BB0C4;">Hi ${agentUser.profile.firstName},</p>
          <p style="color: #9BB0C4;">Your agent portal is ready. Click below to set up your password and access your Agent Progression Tracker.</p>
          <a href="${inviteUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #C9A96E; color: #142D48; font-weight: 700; text-decoration: none; border-radius: 4px;">
            Set Up Your Portal
          </a>
          <p style="color: #6B8299; font-size: 13px;">This link expires in 72 hours. If you have questions, contact your trainer.</p>
          <p style="color: #6B8299; font-size: 11px; margin-top: 24px;">All Financial Freedom | Agent Code: ${agentUser.profile.agentCode}</p>
        </div>
      `
      await fetch('https://services.leadconnectorhq.com/conversations/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghlApiKey}`,
          Version: '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'Email',
          contactId: ghlContactId,
          subject: 'Welcome to All Financial Freedom — Set Up Your Portal',
          html: emailBody,
        }),
      })
    }
  }

  return NextResponse.json({ ok: true, inviteToken, inviteUrl, agentName })
}
