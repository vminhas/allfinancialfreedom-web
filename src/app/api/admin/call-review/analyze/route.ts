import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { reviewTranscript, TranscriptTooShortError } from '@/lib/call-review'

// POST /api/admin/call-review/analyze
// Admin-facing transcript analysis. Persists the result so the admin
// can build a coaching history over time -- same 6-dimension AFF
// rubric the agents are scored against, but the row lives in
// admin_call_reviews keyed on the admin who ran it.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const adminUserId = (session.user as { id?: string }).id
  if (!adminUserId) {
    return NextResponse.json({ error: 'Missing admin user id' }, { status: 401 })
  }

  const body = await req.json() as {
    transcriptText: string
    contactName?: string
    callDate?: string  // YYYY-MM-DD from the date input
  }

  if (!body.transcriptText || body.transcriptText.trim().length === 0) {
    return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
  }

  const callDate = body.callDate
    ? new Date(`${body.callDate}T12:00:00`)  // noon to dodge tz parsing flips
    : new Date()
  if (isNaN(callDate.getTime())) {
    return NextResponse.json({ error: 'Invalid callDate' }, { status: 400 })
  }

  try {
    const result = await reviewTranscript({
      transcriptText: body.transcriptText,
      contactName: body.contactName,
      // No agentContext — admin is reviewing their own call
    })

    const saved = await db.adminCallReview.create({
      data: {
        adminUserId,
        contactName: body.contactName?.trim() || null,
        callDate,
        callTranscript: body.transcriptText,
        overallScore: result.overallScore,
        rubricScores: result.rubricScores,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        coachingTips: result.coachingTips,
        nextSteps: result.nextSteps,
        summary: result.summary,
        scoreBoosters: result.scoreBoosters ?? null,
        modelId: result.modelId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreateTokens: result.cacheCreateTokens,
      },
      select: { id: true, reviewedAt: true },
    })

    return NextResponse.json({
      result: { ...result, scoreBoosters: result.scoreBoosters ?? null },
      reviewId: saved.id,
      reviewedAt: saved.reviewedAt.toISOString(),
    })
  } catch (err) {
    if (err instanceof TranscriptTooShortError) {
      return NextResponse.json(
        { error: `Transcript too short (${err.wordCount} words). Need at least 100 words for a useful review.` },
        { status: 400 }
      )
    }
    console.error('[admin call-review] failed:', err)
    return NextResponse.json({ error: 'Failed to review transcript' }, { status: 500 })
  }
}
