import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/vault/recruits/[id]/reject — discard an ICA submission.
// Use for spam PDFs, parse-failed rows that should not retry, or
// duplicate ICAs after a recruiter re-dropped the same file. Does
// not create any agent. Reversible only by editing the DB row's
// status back to PENDING.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { note?: string }

  const submission = await db.icaSubmission.findUnique({ where: { id } })
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (submission.status === 'APPROVED') {
    return NextResponse.json({ error: 'Cannot reject an already-approved submission' }, { status: 409 })
  }

  const reviewerEmail = (session?.user as { email?: string } | undefined)?.email ?? null
  await db.icaSubmission.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedByEmail: reviewerEmail,
      reviewNote: body.note?.slice(0, 1000) ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
