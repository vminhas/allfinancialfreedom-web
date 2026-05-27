import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail } from '@/lib/agent-identity'
import { put, del } from '@vercel/blob'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }

  const profileId = await getAgentProfileIdFromEmail(email)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, or WebP allowed' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const filename = `vision-boards/${profileId}.${ext}`
  const blob = await put(filename, file, { access: 'public', allowOverwrite: true })
  const visionBoardUrl = `${blob.url}?v=${Date.now()}`

  await db.personalFinancialReview.upsert({
    where: { agentProfileId: profileId },
    create: { agentProfileId: profileId, visionBoardUrl },
    update: { visionBoardUrl },
  })

  return NextResponse.json({ ok: true, visionBoardUrl })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }

  const profileId = await getAgentProfileIdFromEmail(email)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const pfr = await db.personalFinancialReview.findUnique({
    where: { agentProfileId: profileId },
    select: { visionBoardUrl: true },
  })

  if (pfr?.visionBoardUrl) {
    const cleanUrl = pfr.visionBoardUrl.split('?')[0]
    await del(cleanUrl).catch(() => {})
  }

  await db.personalFinancialReview.upsert({
    where: { agentProfileId: profileId },
    create: { agentProfileId: profileId, visionBoardUrl: null },
    update: { visionBoardUrl: null },
  })

  return NextResponse.json({ ok: true })
}
