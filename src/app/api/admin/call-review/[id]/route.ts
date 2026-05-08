import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/call-review/[id]
//   Full record including transcript + arrays for re-opening an old
//   review in the modal. Scoped to the calling admin's own reviews.
//
// PATCH /api/admin/call-review/[id]
//   Update the free-form notes field and/or the recorded call outcome
//   after the fact.
//
// DELETE /api/admin/call-review/[id]
//   Permanently remove a saved review.

const VALID_OUTCOMES = new Set([
  'RECRUITED', 'APPOINTMENT_BOOKED', 'POLICY_CLOSED',
  'FOLLOW_UP_SCHEDULED', 'NOT_INTERESTED', 'NO_CONTACT',
])

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  const id = (session.user as { id?: string }).id
  if (!id) return null
  return id
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminUserId = await requireAdmin()
  if (!adminUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const row = await db.adminCallReview.findUnique({ where: { id } })
  if (!row || row.adminUserId !== adminUserId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    review: {
      id: row.id,
      contactName: row.contactName,
      callDate: row.callDate.toISOString(),
      reviewedAt: row.reviewedAt.toISOString(),
      callTranscript: row.callTranscript,
      overallScore: row.overallScore,
      rubricScores: row.rubricScores,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
      coachingTips: row.coachingTips,
      nextSteps: row.nextSteps,
      summary: row.summary,
      notes: row.notes,
      outcome: row.outcome,
    },
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminUserId = await requireAdmin()
  if (!adminUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.adminCallReview.findUnique({ where: { id }, select: { adminUserId: true } })
  if (!existing || existing.adminUserId !== adminUserId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json() as { notes?: string | null; outcome?: string | null }

  const update: Record<string, unknown> = {}
  if ('notes' in body) {
    update.notes = body.notes?.trim() || null
  }
  // Outcome is optional and nullable; an empty string or null clears
  // the field. Anything not in the enum is rejected to keep the row
  // queryable for reporting later.
  if ('outcome' in body) {
    if (body.outcome === null || body.outcome === '') {
      update.outcome = null
    } else if (typeof body.outcome === 'string' && VALID_OUTCOMES.has(body.outcome)) {
      update.outcome = body.outcome
    } else {
      return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 })
    }
  }

  await db.adminCallReview.update({ where: { id }, data: update })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminUserId = await requireAdmin()
  if (!adminUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.adminCallReview.findUnique({ where: { id }, select: { adminUserId: true } })
  if (!existing || existing.adminUserId !== adminUserId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.adminCallReview.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
