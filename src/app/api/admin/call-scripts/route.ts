import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

const VALID_CALL_TYPES = new Set(['RECRUIT', 'FOLLOW_UP', 'CLIENT_APPOINTMENT', 'OTHER'])

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

// GET /api/admin/call-scripts — list every script grouped by call type.
// The admin UI shows them in an accordion of CallType sections so it's
// obvious which is the active script per type.
export async function GET() {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scripts = await db.callScript.findMany({
    orderBy: [{ callType: 'asc' }, { active: 'desc' }, { updatedAt: 'desc' }],
  })
  return NextResponse.json({ scripts })
}

// POST /api/admin/call-scripts — create a new script. Activating it
// auto-deactivates any other active script for the same callType so
// the AI always has a single source of truth per type.
export async function POST(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    callType?: string
    name?: string
    content?: string
    resourceUrl?: string
    active?: boolean
  }
  if (!body.callType || !VALID_CALL_TYPES.has(body.callType)) {
    return NextResponse.json({ error: 'Invalid callType' }, { status: 400 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }

  const callType = body.callType as 'RECRUIT' | 'FOLLOW_UP' | 'CLIENT_APPOINTMENT' | 'OTHER'
  const active = body.active !== false

  const created = await db.$transaction(async tx => {
    if (active) {
      await tx.callScript.updateMany({
        where: { callType, active: true },
        data: { active: false },
      })
    }
    return tx.callScript.create({
      data: {
        callType,
        name: body.name!.trim(),
        content: body.content!.trim(),
        resourceUrl: body.resourceUrl?.trim() || null,
        active,
      },
    })
  })
  return NextResponse.json({ script: created })
}
