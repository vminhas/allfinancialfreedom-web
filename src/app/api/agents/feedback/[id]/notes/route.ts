import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

// GET /api/agents/feedback/[id]/notes
// Agent-only, scoped to the caller's own feedback rows. Internal notes
// are filtered out (admin-only context).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error
  const profileId = identity.profileId
  const { id } = await ctx.params

  const feedback = await db.agentFeedback.findUnique({
    where: { id },
    select: { agentProfileId: true },
  })
  if (!feedback || feedback.agentProfileId !== profileId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const notes = await db.agentFeedbackNote.findMany({
    where: { feedbackId: id, isInternal: false },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorAdmin: { select: { id: true, name: true } },
      authorAgentProfile: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  return NextResponse.json({ notes })
}

// POST /api/agents/feedback/[id]/notes
// Agent posts a clarification question or follow-up. Always visible
// (agents have no "internal" mode). Pings the admin activity Discord
// channel so the team sees the reply without opening /vault/feedback.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error
  const profileId = identity.profileId
  const { id } = await ctx.params

  const body = await req.json() as { body?: unknown }
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text || text.length < 1) {
    return NextResponse.json({ error: 'Body required' }, { status: 400 })
  }

  const feedback = await db.agentFeedback.findUnique({
    where: { id },
    select: {
      id: true, message: true, agentProfileId: true,
      agentProfile: { select: { firstName: true, lastName: true, agentCode: true } },
    },
  })
  if (!feedback || feedback.agentProfileId !== profileId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const note = await db.agentFeedbackNote.create({
    data: {
      feedbackId: id,
      body: text,
      isInternal: false,
      authorAgentProfileId: profileId,
    },
    select: {
      id: true, body: true, createdAt: true,
      authorAgentProfile: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  // Admin activity ping. Same channel + style as the existing feedback
  // creation/status pings so the queue reads as one chronological feed.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
      const preview = text.length > 300 ? text.slice(0, 300) + '...' : text
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: '↩️ Agent replied on a feedback ticket',
          description: preview,
          color: 0x60A5FA,
          fields: [
            { name: 'From', value: `${feedback.agentProfile.firstName} ${feedback.agentProfile.lastName} (${feedback.agentProfile.agentCode})`, inline: true },
            { name: 'Original', value: feedback.message.slice(0, 200) + (feedback.message.length > 200 ? '...' : '') },
          ],
          footer: { text: 'AFF Concierge · /vault/feedback' },
          url: `${baseUrl}/vault/feedback`,
          timestamp: new Date().toISOString(),
        }],
      })
    } catch (err) {
      console.warn('[agent feedback note POST] admin ping failed:', err)
    }
  }

  return NextResponse.json({ note })
}
