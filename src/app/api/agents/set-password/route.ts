import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// POST /api/agents/set-password — accept invite and set password
export async function POST(req: NextRequest) {
  const { token, password } = await req.json() as { token: string; password: string }

  if (!token || !password) {
    return NextResponse.json({ error: 'token and password required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const agentUser = await db.agentUser.findUnique({ where: { inviteToken: token } })
  if (!agentUser) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 400 })
  }
  if (!agentUser.inviteExpires || agentUser.inviteExpires < new Date()) {
    return NextResponse.json({ error: 'Invite link has expired' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await db.agentUser.update({
    where: { id: agentUser.id },
    data: { passwordHash, inviteToken: null, inviteExpires: null },
  })

  return NextResponse.json({ ok: true, email: agentUser.email })
}
