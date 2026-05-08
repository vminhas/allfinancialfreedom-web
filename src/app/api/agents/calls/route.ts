import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail as getProfileId } from '@/lib/agent-identity'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50
  const skip = (page - 1) * limit

  const [calls, total] = await Promise.all([
    db.callLog.findMany({
      where: { agentProfileId: profileId },
      orderBy: { callDate: 'desc' },
      skip,
      take: limit,
      include: {
        review: {
          select: {
            id: true,
            overallScore: true,
            flaggedForCoaching: true,
            reviewedAt: true,
          },
        },
      },
      // outcome returned for display in call log list
    }),
    db.callLog.count({ where: { agentProfileId: profileId } }),
  ])

  return NextResponse.json({ calls, total, page })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const VALID_OUTCOMES = new Set([
    'RECRUITED', 'APPOINTMENT_BOOKED', 'POLICY_CLOSED',
    'FOLLOW_UP_SCHEDULED', 'NOT_INTERESTED', 'NO_CONTACT',
  ])
  const VALID_CALL_TYPES = new Set([
    'RECRUIT', 'FOLLOW_UP', 'CLIENT_APPOINTMENT', 'OTHER',
  ])

  const body = await req.json() as {
    callDate: string
    contactName: string
    phoneNumber?: string
    subject?: string
    notes?: string
    callType?: string
    callTypeOther?: string
    outcome?: string
    followUpNeeded?: boolean
    transcriptText?: string
    durationSeconds?: number
  }

  if (!body.callDate || !body.contactName) {
    return NextResponse.json({ error: 'callDate and contactName required' }, { status: 400 })
  }

  const outcome = body.outcome && VALID_OUTCOMES.has(body.outcome) ? body.outcome : undefined
  const callType = body.callType && VALID_CALL_TYPES.has(body.callType) ? body.callType : undefined
  // Only persist the OTHER label when callType actually is OTHER —
  // prevents stale free-text from a user toggling away from OTHER.
  const callTypeOther = callType === 'OTHER' && body.callTypeOther?.trim()
    ? body.callTypeOther.trim()
    : undefined

  const hasTranscript = body.transcriptText && body.transcriptText.trim().length > 0

  const call = await db.callLog.create({
    data: {
      agentProfileId: profileId,
      callDate: new Date(body.callDate),
      contactName: body.contactName,
      phoneNumber: body.phoneNumber,
      subject: body.subject,
      notes: body.notes,
      callType: callType as never,
      callTypeOther,
      outcome: outcome as never,
      followUpNeeded: body.followUpNeeded ?? false,
      transcriptText: hasTranscript ? body.transcriptText : null,
      transcriptSource: hasTranscript ? 'MANUAL_PASTE' : null,
      durationSeconds: body.durationSeconds,
    },
  })

  return NextResponse.json({ call, hasTranscript })
}
