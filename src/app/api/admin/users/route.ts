import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// GET /api/admin/users — list all admin users (without password hashes)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await db.adminUser.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ users })
}

// POST /api/admin/users — create a new admin user
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    email: string
    name: string
    password: string
    role?: 'ADMIN' | 'LICENSING_COORDINATOR'
  }

  if (!body.email || !body.name || !body.password) {
    return NextResponse.json({ error: 'email, name, and password are required' }, { status: 400 })
  }

  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const role = body.role === 'LICENSING_COORDINATOR' ? 'LICENSING_COORDINATOR' : 'ADMIN'
  const email = body.email.toLowerCase().trim()

  const existing = await db.adminUser.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'An admin with that email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(body.password, 12)

  const user = await db.adminUser.create({
    data: {
      email,
      name: body.name.trim(),
      passwordHash,
      role,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
  })

  return NextResponse.json({ user })
}
