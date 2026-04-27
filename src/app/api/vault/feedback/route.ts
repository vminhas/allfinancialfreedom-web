import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const feedback = await db.agentFeedback.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      agentProfile: {
        select: { firstName: true, lastName: true, agentCode: true, phase: true },
      },
    },
    take: 100,
  })

  return NextResponse.json({ feedback })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id, read, adminNotes } = await req.json() as { id: string; read?: boolean; adminNotes?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (read !== undefined) data.read = read
  if (adminNotes !== undefined) data.adminNotes = adminNotes

  await db.agentFeedback.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}
