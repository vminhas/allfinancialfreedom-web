import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }
  const profile = await db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id } = await ctx.params
  // Either the writer OR the split agent can post notes. The split
  // agent's access bypasses the phase gate (they may be Phase 2 on
  // a Phase 4 colleague's policy). Anyone else gets 404 — we don't
  // leak existence by 403'ing.
  const submission = await db.newBusinessSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      agentProfileId: true,
      splitWithAgentId: true,
      carrier: true,
      clientFirstName: true,
      clientLastName: true,
    },
  })
  const isWriter = submission?.agentProfileId === profile.id
  const isSplit  = submission?.splitWithAgentId === profile.id
  if (!submission || (!isWriter && !isSplit)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json() as { body?: string }
  const text = (body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  const note = await db.newBusinessNote.create({
    data: {
      submissionId: id,
      body: text,
      authorType: 'AGENT',
      authorAgentId: profile.id,
    },
    include: { authorAgent: { select: { firstName: true, lastName: true } } },
  })

  // Ping the OTHER agent (writer when split posts, vice versa) so
  // the thread feels like live collaboration. Author never gets
  // notified of their own post. Routed through the unified notify
  // helper so it lands in the bell + Discord DM in one call.
  const otherAgentId =
    isWriter ? submission.splitWithAgentId :
    isSplit  ? submission.agentProfileId   :
    null
  if (otherAgentId) {
    const [myProfile, mute] = await Promise.all([
      db.agentProfile.findUnique({
        where: { id: profile.id },
        select: { firstName: true, lastName: true },
      }),
      // Recipient's mute row for this submission, if any. When muted,
      // we still write the in-app notification (so they catch up in
      // the bell inbox + see the toast if they're in-portal) but
      // skip the Discord DM.
      db.newBusinessSubmissionMute.findUnique({
        where: { submissionId_agentProfileId: { submissionId: submission.id, agentProfileId: otherAgentId } },
        select: { id: true },
      }),
    ])
    const fromName = myProfile ? `${myProfile.firstName} ${myProfile.lastName}` : 'Your collaborator'
    const clientName = `${submission.clientFirstName} ${submission.clientLastName}`
    const { createNotification } = await import('@/lib/notify')
    createNotification({
      recipientAgentProfileId: otherAgentId,
      kind: 'policy.comment',
      subjectType: 'new_business',
      subjectId: submission.id,
      title: `💬 ${fromName} commented on ${clientName}'s policy`,
      body: text.length > 200 ? text.slice(0, 200) + '…' : text,
      linkUrl: `/agents?tab=new-business&submission=${submission.id}`,
      color: 0x9B6DFF,
      // Skip Discord DM when recipient muted this submission.
      discord: mute ? undefined : {
        title: `💬 New comment on ${clientName}'s policy`,
        description: text.length > 800 ? text.slice(0, 800) + '…' : text,
        color: 0x9B6DFF,
        fields: [
          { name: 'From',    value: fromName,            inline: true },
          { name: 'Carrier', value: submission.carrier,  inline: true },
        ],
      },
    }).catch(err => console.warn('[new-business notes] notify failed:', err))
  }

  // Audit ping to the licensing-coordinator / admin Discord channel
  // so the LC tracks every conversation on their submissions, even
  // when they're not the assigned reviewer or part of the back-and-
  // forth themselves. Channel post (not DM) so it's a passive feed
  // rather than a direct interrupt for every message.
  const adminChannelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  if (adminChannelId && process.env.DISCORD_BOT_TOKEN) {
    try {
      const author = await db.agentProfile.findUnique({
        where: { id: profile.id },
        select: { firstName: true, lastName: true, agentCode: true },
      })
      const fromName = author
        ? `${author.firstName} ${author.lastName} (${author.agentCode})`
        : 'an agent'
      const clientName = `${submission.clientFirstName} ${submission.clientLastName}`
      const { sendChannelMessage } = await import('@/lib/discord')
      sendChannelMessage(adminChannelId, {
        embeds: [{
          title: `💬 New Business note · ${clientName}`,
          description: text.length > 800 ? text.slice(0, 800) + '…' : text,
          color: 0x9B6DFF,
          fields: [
            { name: 'From',    value: fromName,                 inline: true },
            { name: 'Carrier', value: submission.carrier,       inline: true },
          ],
          footer: { text: 'AFF · Licensing audit feed' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => { /* non-fatal */ })
    } catch (err) {
      console.warn('[new-business notes] admin-channel ping failed:', err)
    }
  }

  return NextResponse.json({ note })
}
