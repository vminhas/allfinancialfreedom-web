import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// DELETE /api/admin/users/[id] — remove an admin (can't remove yourself)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const currentUserId = (session.user as { id?: string }).id

  if (id === currentUserId) {
    return NextResponse.json({ error: "You can't remove your own admin account" }, { status: 400 })
  }

  // Prevent removing the last admin
  const totalAdmins = await db.adminUser.count()
  if (totalAdmins <= 1) {
    return NextResponse.json({ error: "Can't remove the last admin" }, { status: 400 })
  }

  await db.adminUser.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// PATCH /api/admin/users/[id] — update name or reset password
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
    name?: string
    newPassword?: string
  }

  const data: Record<string, unknown> = {}
  if (body.name) data.name = body.name.trim()
  if (body.newPassword) {
    if (body.newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    data.passwordHash = await bcrypt.hash(body.newPassword, 12)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const user = await db.adminUser.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true },
  })

  return NextResponse.json({ user })
}
