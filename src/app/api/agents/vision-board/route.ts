import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail } from '@/lib/agent-identity'
import { getSetting } from '@/lib/settings'
import { put, del } from '@vercel/blob'

async function resolveProfileId(req: NextRequest): Promise<string | null> {
  const url = new URL(req.url)

  const previewToken = url.searchParams.get('preview')
  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) return data.agentProfileId
    }
  }

  const session = await getServerSession(authOptions)
  if (!session) return null
  const role = (session.user as { role?: string }).role

  if (role === 'admin') {
    return url.searchParams.get('agentProfileId')
  }

  if (role === 'agent') {
    return getAgentProfileIdFromEmail(session.user!.email!)
  }

  return null
}

export async function POST(req: NextRequest) {
  const profileId = await resolveProfileId(req)
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

export async function DELETE(req: NextRequest) {
  const profileId = await resolveProfileId(req)
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
