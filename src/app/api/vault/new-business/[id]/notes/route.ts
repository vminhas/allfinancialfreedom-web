import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { policyTypeLabel } from '@/lib/new-business-notifications'
import {
  formatNewBusinessNoteBody,
  buildLicensingMirrorNote,
  statusLabel,
} from '@/lib/lc-notes-format'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const adminId = (session!.user as { id: string }).id
  const adminName = (session!.user as { name?: string }).name ?? 'Coordinator'

  // Pull the agent IDs alongside the submission so we can fire the
  // same in-app + Discord + SSE pipeline that agent-to-agent notes
  // use. Without this, admin notes saved silently and agents had
  // no idea anyone replied until their next refresh. policyType +
  // status are needed to build the standardized licensing mirror note.
  const submission = await db.newBusinessSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      agentProfileId: true,
      splitWithAgentId: true,
      carrier: true,
      policyType: true,
      status: true,
      clientFirstName: true,
      clientLastName: true,
    },
  })
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Two payload shapes are accepted:
  //   Structured (the LC SOP composer): { actionTaken?, tevahVerified?, note? }
  //   Legacy free-text:                 { body }
  // The structured shape formats into the SOP note body AND mirrors a
  // standardized one-liner onto the agent's licensing record.
  const payload = await req.json() as {
    body?: string
    actionTaken?: string
    note?: string
    tevahVerified?: boolean
  }
  const isStructured =
    payload.actionTaken !== undefined ||
    payload.note !== undefined ||
    payload.tevahVerified !== undefined

  const tevahVerified = !!payload.tevahVerified
  const text = isStructured
    ? formatNewBusinessNoteBody({
        actionTaken: payload.actionTaken,
        tevahVerified,
        note: payload.note,
      })
    : (payload.body ?? '').trim()

  if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  // Create the submission note and (for structured SOP notes) the
  // standardized licensing mirror note in one transaction so we never
  // leave one without the other. First-note detection reads the count
  // inside the transaction so two rapid saves can't both claim "first."
  const note = await db.$transaction(async tx => {
    const created = await tx.newBusinessNote.create({
      data: {
        submissionId: id,
        body: text,
        authorType: 'ADMIN',
        authorAdminId: adminId,
        tevahVerified,
      },
      include: { authorAdmin: { select: { name: true } } },
    })

    if (isStructured) {
      const priorCount = await tx.newBusinessNote.count({
        where: { submissionId: id, id: { not: created.id } },
      })
      const clientName = `${submission.clientFirstName} ${submission.clientLastName}`.trim()
      const mirror = buildLicensingMirrorNote({
        isFirstNote: priorCount === 0,
        policyTypeLabel: policyTypeLabel(submission.policyType),
        clientName,
        carrier: submission.carrier,
        statusLabel: statusLabel(submission.status),
      })
      await tx.licensingNote.create({
        data: {
          agentProfileId: submission.agentProfileId,
          authorId: adminId,
          body: mirror,
          scope: 'LICENSING',
        },
      })
    }

    return created
  })

  // Notify both collaborators (writer + split agent) so admin notes
  // travel through the same SSE / bell-icon / Discord-DM pipeline
  // that agent-to-agent notes use. NotificationCenter rebroadcasts
  // each event to the window-level 'aff-notification' channel which
  // SubmissionDrawer subscribes to, so an open thread updates live;
  // closed sessions get the toast + DM.
  const recipients = [submission.agentProfileId, submission.splitWithAgentId].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  )
  if (recipients.length > 0) {
    const clientName = `${submission.clientFirstName} ${submission.clientLastName}`
    const { createNotification } = await import('@/lib/notify')
    // Per-recipient mute lookup. Muted submissions still get the
    // in-app row (so the agent can find it later in the bell inbox)
    // but skip the out-of-band Discord DM.
    const mutes = await db.newBusinessSubmissionMute.findMany({
      where: { submissionId: submission.id, agentProfileId: { in: recipients } },
      select: { agentProfileId: true },
    })
    const mutedSet = new Set(mutes.map(m => m.agentProfileId))
    for (const recipientId of recipients) {
      const isMuted = mutedSet.has(recipientId)
      createNotification({
        recipientAgentProfileId: recipientId,
        kind: 'policy.comment',
        subjectType: 'new_business',
        subjectId: submission.id,
        title: `💬 Coordinator ${adminName} commented on ${clientName}'s policy`,
        body: text.length > 200 ? text.slice(0, 200) + '…' : text,
        linkUrl: `/agents?tab=new-business&submission=${submission.id}`,
        color: 0x9B6DFF,
        discord: isMuted ? undefined : {
          title: `💬 New comment on ${clientName}'s policy`,
          description: text.length > 800 ? text.slice(0, 800) + '…' : text,
          color: 0x9B6DFF,
          fields: [
            { name: 'From',    value: `Coordinator ${adminName}`, inline: true },
            { name: 'Carrier', value: submission.carrier,         inline: true },
          ],
        },
      }).catch(err => console.warn('[vault new-business notes] notify failed:', err))
    }
  }

  return NextResponse.json({ note })
}
