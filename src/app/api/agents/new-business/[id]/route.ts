import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validatePhone, validateEmail } from '@/lib/contact-validation'

async function getAgentProfileId() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') return null
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) return null
  const profile = await db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true },
  })
  return profile?.id ?? null
}

const EDITABLE_FIELDS = [
  'applicationDate', 'carrier', 'policyType', 'points', 'splitWithAgentId',
  'clientFirstName', 'clientLastName', 'clientPhone', 'clientEmail', 'clientBirthday',
  'clientAddressLine1', 'clientAddressLine2', 'clientCity', 'clientState', 'clientZip',
] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profileId = await getAgentProfileId()
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const submission = await db.newBusinessSubmission.findUnique({
    where: { id },
    select: {
      agentProfileId: true, status: true, carrier: true, policyType: true, points: true,
      clientFirstName: true, clientLastName: true,
      agentProfile: { select: { firstName: true, lastName: true } },
    },
  })
  if (!submission || submission.agentProfileId !== profileId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // DECLINED is terminal: re-opening it would muddy reporting. Anything
  // else (PENDING, ISSUED, LAPSED, NOT_TAKEN) can be edited so an agent
  // can fix a typo on a real client even after the policy was issued.
  // Edits on non-PENDING records get an audit ping to the admin channel
  // so the LC isn't surprised by silent changes.
  if (submission.status === 'DECLINED') {
    return NextResponse.json({ error: 'Declined submissions are frozen. Reach out to your licensing coordinator.' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>

  if ('clientPhone' in body) {
    const err = validatePhone(body.clientPhone)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }
  if ('clientEmail' in body) {
    const err = validateEmail(body.clientEmail)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  for (const f of EDITABLE_FIELDS) {
    if (f in body) {
      const v = body[f]
      if (f === 'applicationDate' || f === 'clientBirthday') {
        data[f] = v ? new Date(v as string) : null
      } else if (f === 'points') {
        data[f] = v == null || v === '' ? null : Number(v)
      } else if (f === 'clientPhone' || f === 'clientEmail') {
        data[f] = (v as string).trim()
      } else {
        data[f] = v === '' ? null : v
      }
    }
  }

  const updated = await db.newBusinessSubmission.update({ where: { id }, data })

  // Audit the LC when an issued (or otherwise post-PENDING) record is edited
  // by the agent. Quiet for the normal PENDING case so we don't spam.
  if (submission.status !== 'PENDING' && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const { sendChannelMessage } = await import('@/lib/discord')
    const agentName = `${submission.agentProfile.firstName} ${submission.agentProfile.lastName}`
    const clientName = `${submission.clientFirstName} ${submission.clientLastName}`
    const changedFields = Object.keys(data)
    sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
      content: `✏️ ${agentName} edited a ${submission.status} submission for **${clientName}** (${submission.carrier} ${submission.policyType}). Fields: ${changedFields.join(', ')}`,
    }).catch(() => {})
  }

  return NextResponse.json({ submission: updated })
}
