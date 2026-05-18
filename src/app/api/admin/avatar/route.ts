import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { requireRole } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const email = session!.user!.email
  if (!email) return NextResponse.json({ error: 'No email in session' }, { status: 401 })

  const admin = await db.adminUser.findUnique({ where: { email } })
  if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('avatar') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, or WebP allowed' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const blob = await put(`admin-avatars/${admin.id}.${ext}`, file, { access: 'public', allowOverwrite: true })
  const avatarUrl = `${blob.url}?v=${Date.now()}`

  await db.adminUser.update({ where: { id: admin.id }, data: { avatarUrl } })

  return NextResponse.json({ ok: true, avatarUrl })
}
