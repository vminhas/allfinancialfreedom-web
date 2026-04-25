import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { setSetting, getSetting } from '@/lib/settings'

// POST /api/admin/agents/preview-token
// Generates a short-lived token (5 min) that lets an admin view
// the agent portal as a specific agent. Read-only preview only.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { agentProfileId } = await req.json() as { agentProfileId: string }
  if (!agentProfileId) return NextResponse.json({ error: 'agentProfileId required' }, { status: 400 })

  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!profile) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const token = randomUUID()
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  await setSetting(`PREVIEW_TOKEN_${token}`, JSON.stringify({
    agentProfileId,
    expires,
    createdBy: session.user?.email,
  }))

  return NextResponse.json({ token })
}

// GET /api/admin/agents/preview-token?token=xxx
// Validates a preview token and returns the agent data
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const raw = await getSetting(`PREVIEW_TOKEN_${token}`)
  if (!raw) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

  const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
  if (new Date(data.expires) < new Date()) {
    await setSetting(`PREVIEW_TOKEN_${token}`, '')
    return NextResponse.json({ error: 'Token expired' }, { status: 401 })
  }

  // Clean up the token after use
  await setSetting(`PREVIEW_TOKEN_${token}`, '')

  return NextResponse.json({ agentProfileId: data.agentProfileId })
}
