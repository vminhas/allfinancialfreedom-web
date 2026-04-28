import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validatePhone, validateEmail } from '@/lib/contact-validation'

async function getAgentProfileId() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') return null
  const profile = await db.agentProfile.findFirst({
    where: { agentUser: { email: session.user!.email! } },
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

  const submission = await db.newBusinessSubmission.findUnique({ where: { id }, select: { agentProfileId: true, status: true } })
  if (!submission || submission.agentProfileId !== profileId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Agents can only edit while PENDING — once issued/declined, the record is frozen for them.
  if (submission.status !== 'PENDING') {
    return NextResponse.json({ error: 'Cannot edit a submission once it has left PENDING status' }, { status: 403 })
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
  return NextResponse.json({ submission: updated })
}
