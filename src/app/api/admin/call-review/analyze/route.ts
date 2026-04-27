import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { reviewTranscript, TranscriptTooShortError } from '@/lib/call-review'

// POST /api/admin/call-review/analyze
// Admin-facing one-shot transcript analysis. Does NOT persist anything —
// returns the review result directly so the admin can read it, screenshot it,
// or run another one. If we ever want history we can swap this for a model.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    transcriptText: string
    contactName?: string
  }

  if (!body.transcriptText || body.transcriptText.trim().length === 0) {
    return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
  }

  try {
    const result = await reviewTranscript({
      transcriptText: body.transcriptText,
      contactName: body.contactName,
      // No agentContext — admin is reviewing their own call
    })
    return NextResponse.json({ result })
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
