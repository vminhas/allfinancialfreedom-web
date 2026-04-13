import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// PUT /api/agents/profile — agent updates their own personal info
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    phone?: string
    state?: string
    dateOfBirth?: string
    npn?: string
    licenseNumber?: string
    discordUserId?: string
  }

  const agentUser = await db.agentUser.findUnique({
    where: { email: session.user!.email! },
    include: { profile: true },
  })

  if (!agentUser?.profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const updated = await db.agentProfile.update({
    where: { id: agentUser.profile.id },
    data: {
      ...(body.phone !== undefined && { phone: body.phone || null }),
      ...(body.state !== undefined && { state: body.state || null }),
      ...(body.dateOfBirth !== undefined && {
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      }),
      ...(body.npn !== undefined && { npn: body.npn || null }),
      ...(body.licenseNumber !== undefined && { licenseNumber: body.licenseNumber || null }),
      ...(body.discordUserId !== undefined && { discordUserId: body.discordUserId || null }),
    },
  })

  return NextResponse.json({ ok: true, profileId: updated.id })
}
