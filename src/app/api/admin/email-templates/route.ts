import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

const DEFAULT_TEMPLATES = [
  { key: 'agent_invite', label: 'Agent Portal Invite', subject: 'Welcome to All Financial Freedom — Set Up Your Portal', description: 'Sent when a new agent is invited to the portal', bodyHtml: '<p>Hi {{firstName}},</p><p>Your agent portal is ready. Click the button below to set your password and get started.</p><p><a href="{{inviteUrl}}">Set Up Your Portal</a></p>' },
  { key: 'agent_reminder', label: 'Phase Progress Reminder', subject: 'Your Phase {{phase}} checklist — let\'s get you caught up', description: 'Daily nudge for agents falling behind their phase timeline', bodyHtml: '<p>Hi {{firstName}},</p><p>You\'ve completed {{completed}} of {{total}} items in Phase {{phase}}. You started {{daysAgo}} days ago.</p><p><a href="{{portalUrl}}">Open Your Portal</a></p>' },
  { key: 'referral_approved', label: 'Referral Approved', subject: 'Welcome to All Financial Freedom — Set Up Your Portal', description: 'Sent when a referral is approved and the new agent is created', bodyHtml: '<p>Hi {{firstName}},</p><p>You\'ve been invited to join the AFF team. Click below to set up your portal.</p><p><a href="{{inviteUrl}}">Set Up Your Portal</a></p><p><a href="{{discordInvite}}">Join Discord</a></p>' },
  { key: 'promotion_celebration', label: 'Promotion Celebration DM', subject: 'Congratulations on your promotion!', description: 'Discord DM sent when an agent is promoted to a new phase', bodyHtml: 'Congratulations! You\'ve been promoted to Phase {{phase}}: {{phaseTitle}}. You\'ve unlocked new training channels and resources.' },
]

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  let templates = await db.emailTemplate.findMany({ orderBy: { key: 'asc' } })

  if (templates.length === 0) {
    await db.emailTemplate.createMany({ data: DEFAULT_TEMPLATES, skipDuplicates: true })
    templates = await db.emailTemplate.findMany({ orderBy: { key: 'asc' } })
  }

  return NextResponse.json({ templates })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { id: string; subject?: string; bodyHtml?: string; label?: string; description?: string }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.subject !== undefined) data.subject = body.subject
  if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml
  if (body.label !== undefined) data.label = body.label
  if (body.description !== undefined) data.description = body.description

  const template = await db.emailTemplate.update({ where: { id: body.id }, data })
  return NextResponse.json(template)
}
