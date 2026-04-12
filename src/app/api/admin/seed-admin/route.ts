import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// One-time endpoint to create the first admin user.
// Protected by SEED_SECRET env var — set it once, use it, then remove it.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-seed-secret')
  if (!secret || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, password, name } = await req.json()

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'email, password, and name are required' }, { status: 400 })
  }

  const existing = await db.adminUser.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    return NextResponse.json({ error: 'User already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await db.adminUser.create({
    data: { email: email.toLowerCase(), passwordHash, name },
  })

  return NextResponse.json({ ok: true, id: user.id, email: user.email })
}
