import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { randomUUID } from 'crypto'
import { PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'
import { getGhlConfig, sendGhlEmail, ghlPost } from '@/lib/ghl'
import { buildWelcomeEmailHtml } from '@/lib/welcome-email'

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
    select: { agentCode: true, firstName: true, lastName: true },
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
