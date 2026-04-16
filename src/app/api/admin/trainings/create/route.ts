import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { uploadFlyerToBlob } from '@/lib/blob-upload'

// POST /api/admin/trainings/create — manually create a training event
// Accepts multipart/form-data (for image upload) or JSON (no image).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  let title: string
  let startsAt: string
  let durationMinutes = 60
  let subtitle: string | null = null
  let category: string | null = null
  let presenters: { name: string; role: string }[] = []
  let streamType: 'GFI_LIVE' | 'ZOOM' = 'GFI_LIVE'
  let streamRoomName: string | null = null
  let streamId: string | null = null
  let passcode: string | null = null
  let audienceRestriction: string | null = null
  let partnerBrand: string | null = null
  let targetRegion: string | null = null
  let published = true
  let flyerImageUrl: string | null = null

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    title = form.get('title') as string
    startsAt = form.get('startsAt') as string
    if (form.get('durationMinutes')) durationMinutes = parseInt(form.get('durationMinutes') as string) || 60
    subtitle = (form.get('subtitle') as string) || null
    category = (form.get('category') as string) || null
    streamType = (form.get('streamType') as string) === 'ZOOM' ? 'ZOOM' : 'GFI_LIVE'
    streamRoomName = (form.get('streamRoomName') as string) || null
    streamId = (form.get('streamId') as string) || null
    passcode = (form.get('passcode') as string) || null
    audienceRestriction = (form.get('audienceRestriction') as string) || null
    partnerBrand = (form.get('partnerBrand') as string) || null
    targetRegion = (form.get('targetRegion') as string) || null
    if (form.get('published') === 'false') published = false

    const presentersJson = form.get('presenters') as string
    if (presentersJson) {
      try { presenters = JSON.parse(presentersJson) } catch { /* ignore bad JSON */ }
    }

    // Handle image upload
    const file = form.get('flyerImage') as File | null
    if (file && file.size > 0) {
      const bytes = Buffer.from(await file.arrayBuffer())
      const ct = file.type || 'image/jpeg'
      flyerImageUrl = await uploadFlyerToBlob(`manual-${Date.now()}.${ct.includes('png') ? 'png' : 'jpg'}`, bytes, ct)
    }
  } else {
    // JSON body (no image)
    const body = await req.json() as Record<string, unknown>
    title = body.title as string
    startsAt = body.startsAt as string
    if (body.durationMinutes) durationMinutes = body.durationMinutes as number
    subtitle = (body.subtitle as string) || null
    category = (body.category as string) || null
    streamType = body.streamType === 'ZOOM' ? 'ZOOM' : 'GFI_LIVE'
    streamRoomName = (body.streamRoomName as string) || null
    streamId = (body.streamId as string) || null
    passcode = (body.passcode as string) || null
    audienceRestriction = (body.audienceRestriction as string) || null
    partnerBrand = (body.partnerBrand as string) || null
    targetRegion = (body.targetRegion as string) || null
    if (body.published === false) published = false
    if (Array.isArray(body.presenters)) presenters = body.presenters as { name: string; role: string }[]
  }

  if (!title || !startsAt) {
    return NextResponse.json({ error: 'title and startsAt are required' }, { status: 400 })
  }

  const parsedStartsAt = new Date(startsAt)
  if (isNaN(parsedStartsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid startsAt date' }, { status: 400 })
  }

  const event = await db.trainingEvent.create({
    data: {
      // No Drive fields for manual events
      driveFileId: null,
      driveFileName: null,
      driveModifiedTime: null,
      driveThumbnailUrl: null,
      flyerImageUrl,
      published,
      title,
      subtitle,
      category,
      startsAt: parsedStartsAt,
      durationMinutes,
      presenters,
      streamType,
      streamRoomName,
      streamId,
      passcode,
      audienceRestriction,
      partnerBrand,
      targetRegion,
    },
  })

  // Create Discord scheduled event if published + future + Discord configured
  let discordCreated = false
  if (published && parsedStartsAt > new Date() && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
    try {
      const { createGuildScheduledEvent } = await import('@/lib/discord')
      const endsAt = new Date(parsedStartsAt.getTime() + durationMinutes * 60_000)
      const joinUrl = streamId ? `https://zoom.us/j/${streamId.replace(/[\s-]/g, '')}` : null
      const location = joinUrl ?? (streamRoomName ? `${streamRoomName} · ID ${streamId}` : 'TBD')

      const discordEvent = await createGuildScheduledEvent({
        name: title.slice(0, 100),
        description: subtitle ?? '',
        scheduledStartTime: parsedStartsAt.toISOString(),
        scheduledEndTime: endsAt.toISOString(),
        location,
      })
      await db.trainingEvent.update({
        where: { id: event.id },
        data: { discordEventId: discordEvent.id, discordEventCreatedAt: new Date() },
      })
      discordCreated = true
    } catch (err) {
      console.error('[trainings/create] Discord event creation failed:', err)
    }
  }

  return NextResponse.json({ event, discordCreated })
}
