import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { createNotification } from '@/lib/notify'

// GET /api/vault/feedback/[id]/notes
// Admin-only. Returns the entire thread for a feedback item including
// internal-only notes. The agent-facing equivalent at
// /api/agents/feedback/[id]/notes filters those out.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const { id } = await ctx.params

  const exists = await db.agentFeedback.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const notes = await db.agentFeedbackNote.findMany({
    where: { feedbackId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      body: true,
      isInternal: true,
      createdAt: true,
      authorAdmin: { select: { id: true, name: true } },
      authorAgentProfile: { select: { id: true, firstName: true, lastName: true, agentCode: true } },
    },
  })
  return NextResponse.json({ notes })
}

// POST /api/vault/feedback/[id]/notes
// Admin posts a reply or an internal note. Visible posts trigger an
// agent notification (Discord DM + in-app bell) so they hear back
// without polling. Internal posts are silent.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const { id } = await ctx.params

  const body = await req.json() as { body?: unknown; isInternal?: unknown }
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text || text.length < 1) {
    return NextResponse.json({ error: 'Body required' }, { status: 400 })
  }
  const isInternal = body.isInternal === true

  const feedback = await db.agentFeedback.findUnique({
    where: { id },
    select: {
      id: true,
      message: true,
      status: true,
      agentProfile: { select: { id: true, firstName: true } },
    },
  })
  if (!feedback) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const adminId = (session!.user as { id: string }).id

  const note = await db.agentFeedbackNote.create({
    data: {
      feedbackId: id,
      body: text,
      isInternal,
      authorAdminId: adminId,
    },
    select: {
      id: true, body: true, isInternal: true, createdAt: true,
      authorAdmin: { select: { id: true, name: true } },
    },
  })

  // Notify the agent only on visible posts. Internal-only notes are
  // staff context and should never alert the agent.
  if (!isInternal) {
    createNotification({
      recipientAgentProfileId: feedback.agentProfile.id,
      kind: 'feedback.response',
      subjectType: 'feedback',
      subjectId: feedback.id,
      title: '💬 The team replied to your feedback',
      body: text.length > 200 ? text.slice(0, 200) + '...' : text,
      linkUrl: '/agents#feedback',
      color: 0x9B6DFF,
      discord: {
        title: '💬 The team replied to your feedback',
        description: `${feedback.agentProfile.firstName}, there's a new response on the feedback you sent in. Open the agent portal to view the full thread.`,
        color: 0x9B6DFF,
        fields: [
          { name: 'Your message', value: feedback.message.slice(0, 120) + (feedback.message.length > 120 ? '...' : '') },
          { name: 'From the team', value: text.length > 300 ? text.slice(0, 300) + '...' : text },
        ],
      },
    }).catch(err => console.warn('[feedback note POST] notify failed:', err))
  }

  return NextResponse.json({ note })
}
