import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeUplineNotesAccess } from '@/lib/trainer-trainees'

// Historical leadership notes about an agent. Mirrors the policy
// NewBusinessNote thread. Authorized for:
//   - anyone in the agent's upline (full recruiter chain) or trainer
//   - admins / licensing coordinators (the "CFT" leadership)
// and never for the subject agent themselves (notes are hidden from
// them). GET lists the thread, POST appends and drops a card into the
// Discord agent-activity feed.

type Caller =
  | { kind: 'agent'; profileId: string }
  | { kind: 'admin'; adminId: string }
  | { kind: 'error'; res: NextResponse }

async function resolveCaller(req: NextRequest, agentCode: string): Promise<{
  caller: Caller
  target?: { id: string; firstName: string; lastName: string }
}> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role

  // Admin / LC path: full access to any agent's notes, authored as ADMIN.
  if (role === 'admin' || role === 'licensing_coordinator') {
    const adminId = (session!.user as { id?: string }).id
    const target = await db.agentProfile.findUnique({
      where: { agentCode },
      select: { id: true, firstName: true, lastName: true },
    })
    if (!adminId) return { caller: { kind: 'error', res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } }
    if (!target) return { caller: { kind: 'error', res: NextResponse.json({ error: 'Agent not found' }, { status: 404 }) } }
    return { caller: { kind: 'admin', adminId }, target }
  }

  // Agent path: must be in the target's upline chain or be their trainer.
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return { caller: { kind: 'error', res: id.error } }
  const target = await authorizeUplineNotesAccess(id.profileId, agentCode)
  if (!target) {
    return {
      caller: {
        kind: 'error',
        res: NextResponse.json(
          { error: "You don't have access to this agent's notes. You need to be in their upline or their trainer." },
          { status: 403 },
        ),
      },
    }
  }
  return { caller: { kind: 'agent', profileId: id.profileId }, target }
}

function authorLabel(n: {
  authorType: 'AGENT' | 'ADMIN'
  authorAgent: { firstName: string; lastName: string } | null
  authorAdmin: { name: string } | null
}): string {
  if (n.authorType === 'ADMIN') return n.authorAdmin?.name ?? 'AFF Leadership'
  return n.authorAgent ? `${n.authorAgent.firstName} ${n.authorAgent.lastName}` : 'Upline'
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ agentCode: string }> },
) {
  const { agentCode } = await ctx.params
  const { caller, target } = await resolveCaller(req, agentCode)
  if (caller.kind === 'error') return caller.res
  if (!target) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const notes = await db.agentNote.findMany({
    where: { agentProfileId: target.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      body: true,
      authorType: true,
      createdAt: true,
      authorAgent: { select: { firstName: true, lastName: true } },
      authorAdmin: { select: { name: true } },
    },
  })

  return NextResponse.json({
    agent: { agentCode, firstName: target.firstName, lastName: target.lastName },
    notes: notes.map(n => ({
      id: n.id,
      body: n.body,
      authorType: n.authorType,
      author: authorLabel(n),
      createdAt: n.createdAt.toISOString(),
    })),
  })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ agentCode: string }> },
) {
  const { agentCode } = await ctx.params
  const { caller, target } = await resolveCaller(req, agentCode)
  if (caller.kind === 'error') return caller.res
  if (!target) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const json = await req.json().catch(() => ({})) as { body?: string }
  const text = (json.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 })
  if (text.length > 5000) {
    return NextResponse.json({ error: 'Note is too long (5000 char max).' }, { status: 400 })
  }

  const note = await db.agentNote.create({
    data: {
      agentProfileId: target.id,
      body: text,
      authorType: caller.kind === 'admin' ? 'ADMIN' : 'AGENT',
      authorAgentId: caller.kind === 'agent' ? caller.profileId : null,
      authorAdminId: caller.kind === 'admin' ? caller.adminId : null,
    },
    select: {
      id: true,
      body: true,
      authorType: true,
      createdAt: true,
      authorAgent: { select: { firstName: true, lastName: true } },
      authorAdmin: { select: { name: true } },
    },
  })

  // Track it in the Discord agent-activity feed so the whole leadership
  // chain sees coaching history land in real time. Passive channel
  // post (not a DM) and never sent to the subject agent. Non-fatal.
  const activityChannelId = process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID
  if (activityChannelId && process.env.DISCORD_BOT_TOKEN) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const who = authorLabel(note)
      sendChannelMessage(activityChannelId, {
        embeds: [{
          title: `📝 Note added on ${target.firstName} ${target.lastName}`,
          description: text.length > 800 ? text.slice(0, 800) + '…' : text,
          color: 0xc9a96e,
          fields: [
            { name: 'By', value: who, inline: true },
            { name: 'Agent', value: agentCode, inline: true },
          ],
          footer: { text: 'AFF · Agent activity' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => { /* non-fatal */ })
    } catch (err) {
      console.warn('[agent-notes] activity-channel post failed:', err)
    }
  }

  return NextResponse.json({
    note: {
      id: note.id,
      body: note.body,
      authorType: note.authorType,
      author: authorLabel(note),
      createdAt: note.createdAt.toISOString(),
    },
  })
}
