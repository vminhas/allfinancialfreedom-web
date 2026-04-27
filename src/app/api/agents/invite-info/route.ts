import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/agents/invite-info?token=XXX — returns agent name for personalized invite page
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'missing token' }, { status: 400 })
  }

  const agentUser = await db.agentUser.findUnique({
    where: { inviteToken: token },
    include: { profile: { select: { firstName: true, lastName: true, agentCode: true, phase: true } } },
  })

  if (!agentUser || !agentUser.inviteExpires || agentUser.inviteExpires < new Date()) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  return NextResponse.json({
    firstName: agentUser.profile?.firstName ?? '',
    lastName: agentUser.profile?.lastName ?? '',
    agentCode: agentUser.profile?.agentCode ?? '',
  })
}
