import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { uploadIllustrationToBlob, validateIllustration } from '@/lib/illustration-upload'
import { notifySubmitted } from '@/lib/new-business-notifications'
import { validatePhone, validateEmail } from '@/lib/contact-validation'
import { computeRenewalWindow, todayInEt } from '@/lib/renewals'
import type { PolicyType } from '@/generated/prisma/client'

const VALID_POLICY_TYPES: PolicyType[] = ['TERM', 'WHOLE_LIFE', 'IUL', 'ANNUITY', 'DISABILITY', 'LTC', 'OTHER']

// Phase the agent must reach for the New Business tab to unlock. Below this,
// they see a locked-state card. Was previously the dedicated Clients tab gate.
const NEW_BUSINESS_MIN_PHASE = 4

async function getAgentProfile() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') return null
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) return null
  return db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true, firstName: true, lastName: true, phase: true },
  })
}

export async function GET() {
  const profile = await getAgentProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.phase < NEW_BUSINESS_MIN_PHASE) {
    return NextResponse.json({ error: 'Locked', minPhase: NEW_BUSINESS_MIN_PHASE, phase: profile.phase }, { status: 403 })
  }

  const submissions = await db.newBusinessSubmission.findMany({
    where: { agentProfileId: profile.id },
    orderBy: { createdAt: 'desc' },
    include: {
      splitWithAgent: { select: { firstName: true, lastName: true, agentCode: true } },
      notes: {
        orderBy: { createdAt: 'asc' },
        include: {
          authorAgent: { select: { firstName: true, lastName: true } },
          authorAdmin: { select: { name: true } },
        },
      },
      renewalReminders: { orderBy: { sentAt: 'desc' } },
    },
  })

  const today = todayInEt()
  const enriched = submissions.map(s => {
    if (s.status !== 'ISSUED' || !s.issuedDate) {
      return { ...s, daysUntilAnniversary: null, currentStage: null, anniversaryYear: null }
    }
    const w = computeRenewalWindow(s.issuedDate, today)
    return {
      ...s,
      daysUntilAnniversary: w.daysUntilAnniversary,
      currentStage: w.currentStage,
      anniversaryYear: w.anniversaryYear,
    }
  })

  return NextResponse.json({ submissions: enriched })
}

export async function POST(req: NextRequest) {
  const profile = await getAgentProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.phase < NEW_BUSINESS_MIN_PHASE) {
    return NextResponse.json({ error: 'Locked', minPhase: NEW_BUSINESS_MIN_PHASE, phase: profile.phase }, { status: 403 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  let fields: Record<string, unknown> = {}
  let files: File[] = []

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    for (const [k, v] of form.entries()) {
      if (k === 'illustrations' && v instanceof File) {
        if (v.size > 0) files.push(v)
      } else if (typeof v === 'string') {
        fields[k] = v
      }
    }
  } else {
    fields = await req.json() as Record<string, unknown>
  }

  const policyType = fields.policyType as PolicyType | undefined
  if (!policyType || !VALID_POLICY_TYPES.includes(policyType)) {
    return NextResponse.json({ error: 'Invalid policyType' }, { status: 400 })
  }
  if (!fields.applicationDate || !fields.carrier || !fields.clientFirstName || !fields.clientLastName) {
    return NextResponse.json({ error: 'applicationDate, carrier, clientFirstName, clientLastName are required' }, { status: 400 })
  }
  const phoneErr = validatePhone(fields.clientPhone)
  if (phoneErr) return NextResponse.json({ error: phoneErr }, { status: 400 })
  const emailErr = validateEmail(fields.clientEmail)
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 })
  const phoneStr = (fields.clientPhone as string).trim()
  const emailStr = (fields.clientEmail as string).trim()

  for (const f of files) {
    const err = validateIllustration({ size: f.size, type: f.type })
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const submission = await db.newBusinessSubmission.create({
    data: {
      agentProfileId: profile.id,
      applicationDate: new Date(fields.applicationDate as string),
      carrier: String(fields.carrier),
      policyType,
      points: fields.points != null && fields.points !== '' ? Number(fields.points) : null,
      splitWithAgentId: (fields.splitWithAgentId as string) || null,
      illustrationUrls: [],
      clientFirstName: String(fields.clientFirstName),
      clientLastName: String(fields.clientLastName),
      clientPhone: phoneStr,
      clientEmail: emailStr,
      clientBirthday: fields.clientBirthday ? new Date(fields.clientBirthday as string) : null,
      clientAddressLine1: (fields.clientAddressLine1 as string) || null,
      clientAddressLine2: (fields.clientAddressLine2 as string) || null,
      clientCity: (fields.clientCity as string) || null,
      clientState: (fields.clientState as string) || null,
      clientZip: (fields.clientZip as string) || null,
    },
  })

  if (files.length > 0) {
    const urls: string[] = []
    for (const f of files) {
      const bytes = Buffer.from(await f.arrayBuffer())
      const url = await uploadIllustrationToBlob(submission.id, f.name || 'illustration', bytes, f.type || 'application/octet-stream')
      urls.push(url)
    }
    await db.newBusinessSubmission.update({
      where: { id: submission.id },
      data: { illustrationUrls: urls },
    })
    submission.illustrationUrls = urls
  }

  notifySubmitted({
    agentName: `${profile.firstName} ${profile.lastName}`,
    policyType,
    carrier: submission.carrier,
    clientName: `${submission.clientFirstName} ${submission.clientLastName}`,
    points: submission.points,
  }).catch(() => {})

  return NextResponse.json({ submission })
}
