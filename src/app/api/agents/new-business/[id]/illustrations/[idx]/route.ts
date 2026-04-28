import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { deleteIllustrationFromBlob } from '@/lib/illustration-upload'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; idx: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const profile = await db.agentProfile.findFirst({
    where: { agentUser: { email: session.user!.email! } },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id, idx } = await ctx.params
  const i = parseInt(idx, 10)
  if (Number.isNaN(i) || i < 0) return NextResponse.json({ error: 'Invalid index' }, { status: 400 })

  const submission = await db.newBusinessSubmission.findUnique({
    where: { id },
    select: { agentProfileId: true, illustrationUrls: true },
  })
  if (!submission || submission.agentProfileId !== profile.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (i >= submission.illustrationUrls.length) {
    return NextResponse.json({ error: 'Index out of bounds' }, { status: 400 })
  }

  const removed = submission.illustrationUrls[i]
  const next = submission.illustrationUrls.filter((_, j) => j !== i)

  await db.newBusinessSubmission.update({
    where: { id },
    data: { illustrationUrls: next },
  })
  deleteIllustrationFromBlob(removed).catch(() => {})

  return NextResponse.json({ illustrationUrls: next })
}
