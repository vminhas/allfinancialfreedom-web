import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { randomUUID } from 'crypto'
import { PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'
import { getGhlConfig, sendGhlEmail, ghlPost } from '@/lib/ghl'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'PENDING'

  const referrals = await db.agentReferral.findMany({
    where: status === 'ALL' ? {} : { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' },
    orderBy: { createdAt: 'desc' },
    include: {
      referringAgent: {
        select: { firstName: true, lastName: true, agentCode: true },
      },
    },
  })

  return NextResponse.json({ referrals })
}

function generateAgentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'AFF'
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    action: 'approve' | 'reject'
    adminNotes?: string
    cft?: string
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 })
  }

  const referral = await db.agentReferral.findUnique({ where: { id: body.id } })
  if (!referral) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (referral.status !== 'PENDING') {
    return NextResponse.json({ error: 'Already processed' }, { status: 400 })
  }

  if (body.action === 'reject') {
    await db.agentReferral.update({
      where: { id: body.id },
      data: {
        status: 'REJECTED',
        adminNotes: body.adminNotes,
        approvedAt: new Date(),
        approvedById: (session!.user as { id?: string }).id ?? session!.user!.email,
      },
    })
    return NextResponse.json({ ok: true, status: 'REJECTED' })
  }

  // Approve: create the agent
  const existingUser = await db.agentUser.findUnique({
    where: { email: referral.email },
  })
  if (existingUser) {
    return NextResponse.json({ error: 'Agent with this email already exists' }, { status: 409 })
  }

  let agentCode = generateAgentCode()
  for (let i = 0; i < 5; i++) {
    const exists = await db.agentProfile.findUnique({ where: { agentCode } })
    if (!exists) break
    agentCode = generateAgentCode()
  }

  const referringAgent = await db.agentProfile.findUnique({
    where: { id: referral.referringAgentId },
    select: { agentCode: true },
  })

  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000)

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
            cft: body.cft,
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

    await db.agentReferral.update({
      where: { id: body.id },
      data: {
        status: 'APPROVED',
        adminNotes: body.adminNotes,
        approvedAt: new Date(),
        approvedById: (session!.user as { id?: string }).id ?? session!.user!.email,
        createdAgentId: agentUser.profile?.id,
      },
    })

    // Send invite email via GHL
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
          const discordInvite = process.env.DISCORD_INVITE_URL ?? 'https://discord.gg/allfinancialfreedom'

          const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #0C1E30; color: #ffffff; border-radius: 8px;">
              <h2 style="color: #C9A96E; margin-bottom: 8px;">Welcome to All Financial Freedom</h2>
              <p style="color: #9BB0C4;">Hi ${referral.firstName},</p>
              <p style="color: #9BB0C4;">${referringAgent ? `You've been referred by one of our agents.` : `You've been invited to join the AFF team.`} Click below to set up your portal and start your journey.</p>
              <a href="${inviteUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #C9A96E; color: #142D48; font-weight: 700; text-decoration: none; border-radius: 4px; font-size: 15px;">
                Set Up Your Portal
              </a>
              <p style="color: #9BB0C4; font-size: 13px;">Join our Discord community for training, resources, and team support:</p>
              <a href="${discordInvite}" style="display: inline-block; margin-bottom: 16px; padding: 10px 20px; background: #5865F2; color: #ffffff; font-weight: 700; text-decoration: none; border-radius: 4px; font-size: 13px;">
                Join Discord
              </a>
              <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0;" />
              <p style="color: #4B5563; font-size: 11px; margin: 0;">All Financial Freedom · Agent Code: ${agentCode}</p>
            </div>
          `
          const msgRes = await sendGhlEmail({
            contactId: ghlContactId,
            emailTo: referral.email,
            subject: 'Welcome to All Financial Freedom — Set Up Your Portal',
            html,
            config,
          })
          emailSent = msgRes.ok
        }
      }
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      ok: true,
      status: 'APPROVED',
      agentCode,
      profileId: agentUser.profile?.id,
      emailSent,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
