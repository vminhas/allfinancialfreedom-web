import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'

// POST /api/vault/recruits/[id]/approve
//
// Admin reviews a parsed ICA in /vault/recruits, optionally edits the
// fields, picks an agentCode, and approves. We create the live
// AgentProfile + AgentUser, mark the submission APPROVED, and fire the
// NEW RECRUIT announcement (the same embed flavor the referral-approval
// path uses, so the team sees a single consistent celebration for any
// new teammate regardless of which front door they came through).
//
// Body: { agentCode, firstName, lastName, email, state, recruiterId?,
//         middleName?, dob?, gender?, maritalStatus?, spouseName?,
//         addressLine1?, city?, zip?, country?, classification?,
//         hasLicense?, phone? }
//
// Any field omitted falls back to whatever the parser stored. The form
// in /vault/recruits passes the edited values directly so the admin can
// correct a misparse before approval without re-uploading.

interface ApproveBody {
  agentCode: string
  firstName: string
  lastName: string
  email: string
  state?: string
  phone?: string
  recruiterId?: string
  middleName?: string
  dob?: string | null
  gender?: string
  maritalStatus?: string
  spouseName?: string
  addressLine1?: string
  city?: string
  zip?: string
  country?: string
  classification?: string
  hasLicense?: boolean
  // Set true to bypass the same-first-and-last-name duplicate guard.
  // Admin clicks "Yes, create anyway" in the 409 dialog and the page
  // resubmits with this flag.
  force?: boolean
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params
  const body = await req.json() as ApproveBody

  if (!body.agentCode || !body.firstName || !body.lastName || !body.email) {
    return NextResponse.json({ error: 'agentCode, firstName, lastName, email required' }, { status: 400 })
  }

  const submission = await db.icaSubmission.findUnique({ where: { id } })
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (submission.status !== 'PENDING') {
    return NextResponse.json({ error: `Submission already ${submission.status.toLowerCase()}` }, { status: 409 })
  }

  const agentCode = body.agentCode.toUpperCase()
  const email = body.email.toLowerCase().trim()
  const firstName = body.firstName.trim()
  const lastName = body.lastName.trim()

  // Pre-flight duplicate guard. Three layers, surface as 409s with a
  // human-readable message so the admin can fix the form without
  // staring at a Prisma P2002 error.
  //
  // 1. agentCode collision (someone took this F-code already)
  // 2. email collision on the AgentUser (this person already has a login)
  // 3. probable-same-person guard: same first+last name (case-insensitive)
  //    already exists. The recruiter may have manually created the agent
  //    before the ICA cron processed it, or the same ICA may have been
  //    dropped twice. We surface the conflicting agentCode so the admin
  //    can decide between "merge / reject as duplicate" or "force
  //    create — different person with the same name".
  //
  // Layer (3) is the one the CEO asked for explicitly. It runs BEFORE
  // the create transaction so we don't burn an agentCode on a duplicate.
  const [codeTaken, emailTaken, nameMatch] = await Promise.all([
    db.agentProfile.findUnique({ where: { agentCode }, select: { id: true } }),
    db.agentUser.findUnique({ where: { email }, select: { id: true } }),
    db.agentProfile.findFirst({
      where: {
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true, agentCode: true, firstName: true, lastName: true },
    }),
  ])
  if (codeTaken) return NextResponse.json({ error: `Agent code ${agentCode} already in use` }, { status: 409 })
  if (emailTaken) return NextResponse.json({ error: `Email ${email} already has an account` }, { status: 409 })
  if (nameMatch && !body.force) {
    return NextResponse.json({
      error: `An agent named ${nameMatch.firstName} ${nameMatch.lastName} already exists (code ${nameMatch.agentCode}). If this is a different person, resubmit with force=true.`,
      duplicate: {
        agentProfileId: nameMatch.id,
        agentCode: nameMatch.agentCode,
        firstName: nameMatch.firstName,
        lastName: nameMatch.lastName,
      },
    }, { status: 409 })
  }

  // Resolve recruiter for the announcement embed. recruiterId is the
  // recruiter's agentCode (per CLAUDE.md); we look up the profile so
  // the embed can render "recruited by First Last".
  const recruiterCode = (body.recruiterId ?? submission.referenceCode ?? '').toUpperCase() || null
  const recruiter = recruiterCode
    ? await db.agentProfile.findUnique({
        where: { agentCode: recruiterCode },
        select: { firstName: true, lastName: true, preferredName: true, agentCode: true, discordUserId: true },
      })
    : null

  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72h

  let createdProfileId: string
  try {
    const agentUser = await db.agentUser.create({
      data: {
        email,
        inviteToken,
        inviteExpires,
        profile: {
          create: {
            agentCode,
            firstName: body.firstName.trim(),
            lastName: body.lastName.trim(),
            state: body.state ?? submission.state ?? null,
            phone: body.phone ?? null,
            dateOfBirth: body.dob ? new Date(body.dob) : (submission.dob ?? null),
            addressLine1: body.addressLine1 ?? submission.addressLine1 ?? null,
            city: body.city ?? submission.city ?? null,
            zip: body.zip ?? submission.zip ?? null,
            country: body.country ?? submission.country ?? 'US',
            recruiterId: recruiterCode,
            phase: 1,
            phaseStartedAt: new Date(),
            icaDate: new Date(),
            status: 'ACTIVE',
            phaseItems: {
              create: PHASE_ITEMS[1].map(item => ({
                phase: 1,
                itemKey: item.key,
                completed: false,
              })),
            },
            carrierAppointments: {
              create: CARRIERS.map(carrier => ({ carrier, status: 'NOT_STARTED' })),
            },
          },
        },
      },
      include: { profile: { select: { id: true } } },
    })
    if (!agentUser.profile) throw new Error('Profile was not created (Prisma include returned null)')
    createdProfileId = agentUser.profile.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to create agent: ${msg}` }, { status: 500 })
  }

  // Mark the submission approved + link the new profile. Done after
  // the create so a partial failure leaves the submission PENDING for
  // a retry instead of orphaning the row.
  const reviewerEmail = (session?.user as { email?: string } | undefined)?.email ?? null
  await db.icaSubmission.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedByEmail: reviewerEmail,
      createdAgentProfileId: createdProfileId,
    },
  })

  // NEW RECRUIT broadcast. Mirrors the embed used by the referral-approval
  // path so the team sees a consistent celebration regardless of which
  // front door brought the recruit in. Best-effort: a Discord outage
  // doesn't roll back the agent creation.
  const newRecruitName = `${body.firstName.trim()} ${body.lastName.trim()}`
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const { buildAchievementEmbed } = await import('@/lib/discord-card')
      const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
      const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Agent Code', value: '`' + agentCode + '`', inline: true },
      ]
      if (body.state ?? submission.state) {
        fields.push({ name: 'State', value: (body.state ?? submission.state) as string, inline: true })
      }
      if (recruiter) {
        const { displayFullName } = await import('@/lib/display-name')
        fields.push({
          name: 'Shared by',
          value: `${displayFullName(recruiter)} (\`${recruiter.agentCode}\`)`,
          inline: false,
        })
      }
      await sendChannelMessage(announcementsChannel, {
        embeds: [
          buildAchievementEmbed({
            flavor: 'NEW_RECRUIT',
            protagonist: {
              firstName: body.firstName.trim(),
              lastName: body.lastName.trim(),
              agentCode,
              avatarUrl: null,
            },
            subline: `**${newRecruitName}** just joined AFF.`,
            fields,
          }),
        ],
      })
    } catch (err) {
      console.error('[recruits/approve] announcement post failed:', err)
    }
  }

  return NextResponse.json({
    ok: true,
    agentProfileId: createdProfileId,
    agentCode,
    inviteToken,
  })
}
