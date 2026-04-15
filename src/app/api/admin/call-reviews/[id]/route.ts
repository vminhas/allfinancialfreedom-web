import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// PATCH /api/admin/call-reviews/[id] — admin updates notes / discussed / flag
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as {
    adminNotes?: string | null
    discussedAt?: string | null
    flaggedForCoaching?: boolean
  }

  const data: Record<string, unknown> = {}
  if (body.adminNotes !== undefined) data.adminNotes = body.adminNotes
  if (body.discussedAt !== undefined) {
    data.discussedAt = body.discussedAt ? new Date(body.discussedAt) : null
  }
  if (body.flaggedForCoaching !== undefined) data.flaggedForCoaching = body.flaggedForCoaching

  const review = await db.callReview.update({
    where: { id },
    data,
  })

  return NextResponse.json({ review })
}
