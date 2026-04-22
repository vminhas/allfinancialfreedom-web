import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { setSetting, getSetting } from '@/lib/settings'
import { put } from '@vercel/blob'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const formData = await req.formData()
  const who = formData.get('who') as string | null
  const file = formData.get('avatar') as File | null

  if (!who || !['vick', 'melinee'].includes(who)) {
    return NextResponse.json({ error: 'who must be "vick" or "melinee"' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, or WebP allowed' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const blob = await put(`leadership/${who}.${ext}`, file, { access: 'public', allowOverwrite: true })

  await setSetting(`LEADERSHIP_${who.toUpperCase()}_AVATAR`, blob.url)

  return NextResponse.json({ ok: true, avatarUrl: blob.url })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const vick = await getSetting('LEADERSHIP_VICK_AVATAR')
  const melinee = await getSetting('LEADERSHIP_MELINEE_AVATAR')

  return NextResponse.json({ vick: vick || null, melinee: melinee || null })
}
