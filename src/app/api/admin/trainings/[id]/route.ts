import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { deleteGuildScheduledEvent, createGuildScheduledEvent } from '@/lib/discord'
import { deleteFlyerFromBlob } from '@/lib/blob-upload'

// Helper to build Discord event for a training row
function buildJoinUrl(streamId: string | null): string | null {
  if (!streamId) return null
  const digits = streamId.replace(/[\s-]/g, '')
  if (!/^\d{8,}$/.test(digits)) return null
  return `https://zoom.us/j/${digits}`
}

// GET /api/admin/trainings/[id] — fetch a single training event
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params
  const event = await db.trainingEvent.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ event })
}

// PATCH /api/admin/trainings/[id] — toggle published, edit fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params
  const existing = await db.trainingEvent.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    published?: boolean
    title?: string
    subtitle?: string | null
    category?: string | null
    startsAt?: string
    durationMinutes?: number
    streamType?: 'GFI_LIVE' | 'ZOOM'
    streamRoomName?: string | null
    streamId?: string | null
    passcode?: string | null
    audienceRestriction?: string | null
    partnerBrand?: string | null
    targetRegion?: string | null
  }

  const data: Record<string, unknown> = { manuallyEdited: true }

  // Copy simple editable fields
  const simpleFields = [
    'title', 'subtitle', 'category', 'durationMinutes', 'streamType',
    'streamRoomName', 'streamId', 'passcode', 'audienceRestriction',
    'partnerBrand', 'targetRegion',
  ] as const
  for (const f of simpleFields) {
    if (body[f] !== undefined) data[f] = body[f]
  }
  if (body.startsAt !== undefined) data.startsAt = new Date(body.startsAt)

  // Handle publish toggle — the key behavioral change
  if (body.published !== undefined && body.published !== existing.published) {
    data.published = body.published

    if (!body.published && existing.discordEventId) {
      // Unpublishing: delete the Discord scheduled event
      try {
        await deleteGuildScheduledEvent(existing.discordEventId)
      } catch (err) {
        console.error('[trainings] Failed to delete Discord event:', err)
      }
      data.discordEventId = null
      data.discordEventCreatedAt = null
      data.reminderSentAt = null
    }

    if (body.published && !existing.discordEventId && existing.startsAt > new Date()) {
      // Re-publishing: create the Discord scheduled event
      try {
        if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
          const startsAt = body.startsAt ? new Date(body.startsAt) : existing.startsAt
          const duration = body.durationMinutes ?? existing.durationMinutes ?? 60
          const endsAt = new Date(startsAt.getTime() + duration * 60_000)
          const joinUrl = buildJoinUrl(body.streamId ?? existing.streamId)
          const location = joinUrl ?? (existing.streamRoomName ? `${existing.streamRoomName} · ID ${existing.streamId}` : 'TBD')

          const discordEvent = await createGuildScheduledEvent({
            name: (body.title ?? existing.title).slice(0, 100),
            description: existing.subtitle ?? '',
            scheduledStartTime: startsAt.toISOString(),
            scheduledEndTime: endsAt.toISOString(),
            location,
          })
          data.discordEventId = discordEvent.id
          data.discordEventCreatedAt = new Date()
        }
      } catch (err) {
        console.error('[trainings] Failed to create Discord event on re-publish:', err)
      }
    }
  }

  const updated = await db.trainingEvent.update({ where: { id }, data })
  return NextResponse.json({ event: updated })
}

// DELETE /api/admin/trainings/[id] — permanently delete an event
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params
  const existing = await db.trainingEvent.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete Discord scheduled event if it exists
  if (existing.discordEventId) {
    try {
      await deleteGuildScheduledEvent(existing.discordEventId)
    } catch (err) {
      console.error('[trainings] Failed to delete Discord event on row delete:', err)
    }
  }

  // Clean up Blob image (non-blocking)
  if (existing.flyerImageUrl) {
    deleteFlyerFromBlob(existing.flyerImageUrl).catch(() => {})
  }

  await db.trainingEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
