import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { reviewTranscript, TranscriptTooShortError } from '@/lib/call-review'
import { getAgentProfileIdFromEmail as getProfileId } from '@/lib/agent-identity'

// AI call may push past Vercel's default 60s function timeout on long
// transcripts. Mirror the admin analyze route's 5-min ceiling so the
// agent-side review surfaces the same way.
export const maxDuration = 300

// GET /api/agents/calls/[id]/review — fetch review for a call
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  const call = await db.callLog.findUnique({
    where: { id },
    include: { review: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Agents can only see their own calls; admins can see any
  if (role === 'agent') {
    const profileId = await getProfileId(session.user!.email!)
    if (call.agentProfileId !== profileId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Surface the AFF resource tagged as the script for this call's
  // type so the modal can show "Graded against: [resource]" when
  // re-opening a historical review. Best-effort — uses whatever
  // resource is currently tagged for the callType, which may differ
  // from what was tagged when the review was produced.
  const script = call.callType
    ? await db.setupResource.findFirst({
        where: { callType: call.callType },
        orderBy: { updatedAt: 'desc' },
        select: { label: true, url: true },
      })
    : null

  return NextResponse.json({
    review: call.review,
    hasTranscript: !!call.transcriptText,
    scriptName: script?.label ?? null,
    scriptResourceUrl: script?.url ?? null,
  })
}

// POST /api/agents/calls/[id]/review — trigger Claude analysis
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (role !== 'agent' && role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  const call = await db.callLog.findUnique({
    where: { id },
    include: {
      review: true,
      agentProfile: { select: { id: true, firstName: true, lastName: true, phase: true, goal: true } },
    },
    // include outcome so it can be forwarded to the AI for tone calibration
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Authorization: agents can only review their own calls
  if (role === 'agent') {
    const profileId = await getProfileId(session.user!.email!)
    if (call.agentProfileId !== profileId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (!call.transcriptText) {
    return NextResponse.json({ error: 'No transcript on file for this call' }, { status: 400 })
  }

  if (call.review && !force) {
    return NextResponse.json(
      { error: 'Review already exists. Pass ?force=true to re-run.', review: call.review },
      { status: 409 }
    )
  }

  try {
    const result = await reviewTranscript({
      transcriptText: call.transcriptText,
      agentContext: {
        firstName: call.agentProfile.firstName,
        lastName: call.agentProfile.lastName,
        phase: call.agentProfile.phase,
        goal: call.agentProfile.goal,
      },
      contactName: call.contactName,
      outcome: call.outcome,
      callType: call.callType,
    })

    const review = await db.callReview.upsert({
      where: { callLogId: call.id },
      create: {
        callLogId: call.id,
        agentProfileId: call.agentProfileId,
        overallScore: result.overallScore,
        rubricScores: result.rubricScores,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        coachingTips: result.coachingTips,
        nextSteps: result.nextSteps,
        summary: result.summary,
        scoreBoosters: result.scoreBoosters ?? undefined,
        flaggedForCoaching: result.flaggedForCoaching,
        modelId: result.modelId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreateTokens: result.cacheCreateTokens,
      },
      update: {
        overallScore: result.overallScore,
        rubricScores: result.rubricScores,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        coachingTips: result.coachingTips,
        nextSteps: result.nextSteps,
        summary: result.summary,
        scoreBoosters: result.scoreBoosters ?? undefined,
        flaggedForCoaching: result.flaggedForCoaching,
        modelId: result.modelId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreateTokens: result.cacheCreateTokens,
        reviewedAt: new Date(),
      },
    })

    return NextResponse.json({
      review,
      scriptName: result.scriptName ?? null,
      scriptResourceUrl: result.scriptResourceUrl ?? null,
    })
  } catch (err) {
    if (err instanceof TranscriptTooShortError) {
      return NextResponse.json(
        { error: `Transcript too short (${err.wordCount} words). Need at least 100 words for a useful review.` },
        { status: 400 }
      )
    }
    console.error('[call-review] failed:', err)
    return NextResponse.json({ error: 'Failed to review transcript' }, { status: 500 })
  }
}
