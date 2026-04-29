import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { uploadIllustrationToBlob, validateIllustration } from '@/lib/illustration-upload'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }
  const profile = await db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id } = await ctx.params
  const submission = await db.newBusinessSubmission.findUnique({ where: { id }, select: { agentProfileId: true, illustrationUrls: true } })
  if (!submission || submission.agentProfileId !== profile.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  const err = validateIllustration({ size: file.size, type: file.type })
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const url = await uploadIllustrationToBlob(id, file.name || 'illustration', bytes, file.type || 'application/octet-stream')

  const updated = await db.newBusinessSubmission.update({
    where: { id },
    data: { illustrationUrls: [...submission.illustrationUrls, url] },
    select: { illustrationUrls: true },
  })
  return NextResponse.json({ illustrationUrls: updated.illustrationUrls, addedUrl: url })
}
