import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadIllustrationToBlob, validateIllustration } from '@/lib/illustration-upload'
import { notifySubmitted } from '@/lib/new-business-notifications'
import { validatePhone, validateEmail } from '@/lib/contact-validation'
import { computeRenewalWindow, todayInEt } from '@/lib/renewals'
import { createNotification } from '@/lib/notify'
import { logSubmissionActivity } from '@/lib/submission-activity'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import type { PolicyType } from '@/generated/prisma/client'

const VALID_POLICY_TYPES: PolicyType[] = ['TERM', 'WHOLE_LIFE', 'IUL', 'ANNUITY', 'DISABILITY', 'LTC', 'OTHER']

// Phase the agent must reach for the New Business tab to unlock. Below this,
// they see a locked-state card. Was previously the dedicated Clients tab gate.
const NEW_BUSINESS_MIN_PHASE = 4

export async function GET(req: NextRequest) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error

  const profile = await db.agentProfile.findUnique({
    where: { id: identity.profileId },
    select: { id: true, firstName: true, lastName: true, phase: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const locked = profile.phase < NEW_BUSINESS_MIN_PHASE

  // Return submissions where the caller is the writer OR the split
  // agent. Both lanes are returned regardless of phase — split-agent
  // access bypasses the phase gate so a Phase-2 collaborator can
  // still see + comment on their colleague's policy. The phase gate
  // applies to CREATING new submissions, surfaced via `locked: true`.
  const submissions = await db.newBusinessSubmission.findMany({
    where: {
      OR: [
        { agentProfileId: profile.id },
        { splitWithAgentId: profile.id },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      agentProfile:    { select: { firstName: true, lastName: true, agentCode: true } },
      splitWithAgent:  { select: { firstName: true, lastName: true, agentCode: true } },
      notes: {
        orderBy: { createdAt: 'asc' },
        include: {
          // id is needed by the client so it can color notes by
          // policy role (writer vs split agent). Name alone could
          // collide if two collaborators happen to share one.
          authorAgent: { select: { id: true, firstName: true, lastName: true } },
          authorAdmin: { select: { name: true } },
        },
      },
      renewalReminders: { orderBy: { sentAt: 'desc' } },
      // Caller's own mute row, if any. We surface a boolean rather
      // than the row itself so the client doesn't have to inspect
      // the array.
      mutes: {
        where: { agentProfileId: profile.id },
        select: { id: true },
        take: 1,
      },
      activity: {
        orderBy: { createdAt: 'asc' },
        include: {
          actorAgent: { select: { firstName: true, lastName: true } },
          actorAdmin: { select: { name: true } },
        },
      },
    },
  })

  const today = todayInEt()
  const enriched = submissions.map(s => {
    const lane: 'own' | 'shared' = s.agentProfileId === profile.id ? 'own' : 'shared'
    const muted = s.mutes.length > 0
    if (s.status !== 'ISSUED' || !s.issuedDate) {
      return { ...s, lane, muted, daysUntilAnniversary: null, currentStage: null, anniversaryYear: null }
    }
    const w = computeRenewalWindow(s.issuedDate, today)
    return {
      ...s,
      lane,
      muted,
      daysUntilAnniversary: w.daysUntilAnniversary,
      currentStage: w.currentStage,
      anniversaryYear: w.anniversaryYear,
    }
  })

  return NextResponse.json({
    submissions: enriched,
    locked,
    minPhase: NEW_BUSINESS_MIN_PHASE,
    phase: profile.phase,
  })
}

export async function POST(req: NextRequest) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error
  if (identity.previewing) return NextResponse.json({ error: 'Read-only preview' }, { status: 403 })

  const profile = await db.agentProfile.findUnique({
    where: { id: identity.profileId },
    select: { id: true, firstName: true, lastName: true, phase: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
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

  // Audit-log: CREATED + (SPLIT_ADDED if a split was set on creation).
  // Both rows are independent so the Activity tab reads naturally:
  // "Created the submission" then "Added Bryan Cole as split agent."
  logSubmissionActivity({
    submissionId: submission.id,
    kind: 'CREATED',
    actorAgentProfileId: profile.id,
    meta: { carrier: submission.carrier, policyType },
  })
  if (submission.splitWithAgentId) {
    const split = await db.agentProfile.findUnique({
      where: { id: submission.splitWithAgentId },
      select: { firstName: true, lastName: true, agentCode: true },
    }).catch(() => null)
    logSubmissionActivity({
      submissionId: submission.id,
      kind: 'SPLIT_ADDED',
      actorAgentProfileId: profile.id,
      meta: split ? { name: `${split.firstName} ${split.lastName}`, agentCode: split.agentCode } : {},
    })
  }

  // If the writer added a split agent, ping that person so they know
  // they're collaborating on this policy. Routed through the unified
  // notify helper so it lands in their bell + Discord DM at once.
  if (submission.splitWithAgentId) {
    const writerName = `${profile.firstName} ${profile.lastName}`.trim()
    const clientName = `${submission.clientFirstName} ${submission.clientLastName}`
    createNotification({
      recipientAgentProfileId: submission.splitWithAgentId,
      kind: 'policy.split_added',
      subjectType: 'new_business',
      subjectId: submission.id,
      title: `📎 Added as split agent on ${clientName}'s policy`,
      body: `${writerName} added you as a split agent on a ${submission.carrier} ${policyType.toLowerCase()} policy. You can view and comment on it from New Business.`,
      linkUrl: `/agents?tab=new-business&submission=${submission.id}`,
      color: 0xC9A96E,
      discord: {
        title: '📎 You were added as a split agent',
        description: `**${writerName}** added you to **${clientName}**'s policy. View + comment from your New Business tab.`,
        color: 0xC9A96E,
        fields: [
          { name: 'Carrier',     value: submission.carrier,            inline: true },
          { name: 'Policy type', value: policyType.toString(),         inline: true },
          { name: 'Client',      value: clientName,                    inline: true },
        ],
      },
    }).catch(err => console.warn('[new-business POST] split notify failed:', err))
  }

  return NextResponse.json({ submission })
}
