import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { uploadFlyerToBlob } from '@/lib/blob-upload'
import { RECURRENCE_WINDOW } from '@/lib/training-recurrence'

const MAX_RECURRING_WEEKS = 52
// ~5 weeks of Mon-Fri. Kept modest because each occurrence creates its own
// Discord scheduled event (guilds cap around 100), and there's no auto
// roll-forward yet, so admins re-run to extend a standing daily series.
const MAX_RECURRING_WEEKDAYS = 25

// POST /api/admin/trainings/create — manually create a training event.
// Accepts multipart/form-data (for image upload) or JSON (no image).
//
// When recurring=true, the route creates N weekly occurrences (capped at 52).
// The first instance is the parent (recurrenceFrequency='WEEKLY'); the rest
// link back via recurrenceParentId. Each instance gets its own Discord
// scheduled event so the existing roundup / reminder cron keeps working
// without recurrence-aware logic.
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
  let recurring = false
  let recurringWeeks = 12
  let recurrenceFrequency: 'WEEKLY' | 'WEEKDAYS' = 'WEEKLY'
  let recurringWeekdays = 20
  let recurrenceOngoing = false

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
    if (form.get('recurring') === 'true') recurring = true
    if (form.get('recurrenceFrequency') === 'WEEKDAYS') recurrenceFrequency = 'WEEKDAYS'
    if (form.get('recurringWeeks')) {
      const n = parseInt(form.get('recurringWeeks') as string)
      if (!Number.isNaN(n) && n > 0) recurringWeeks = n
    }
    if (form.get('recurringWeekdays')) {
      const n = parseInt(form.get('recurringWeekdays') as string)
      if (!Number.isNaN(n) && n > 0) recurringWeekdays = n
    }
    if (form.get('recurrenceOngoing') === 'true') recurrenceOngoing = true

    const presentersJson = form.get('presenters') as string
    if (presentersJson) {
      try { presenters = JSON.parse(presentersJson) } catch { /* ignore bad JSON */ }
    }

    const file = form.get('flyerImage') as File | null
    if (file && file.size > 0) {
      const bytes = Buffer.from(await file.arrayBuffer())
      const ct = file.type || 'image/jpeg'
      flyerImageUrl = await uploadFlyerToBlob(`manual-${Date.now()}.${ct.includes('png') ? 'png' : 'jpg'}`, bytes, ct)
    }
  } else {
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
    if (body.recurring === true) recurring = true
    if (body.recurrenceFrequency === 'WEEKDAYS') recurrenceFrequency = 'WEEKDAYS'
    if (typeof body.recurringWeeks === 'number' && body.recurringWeeks > 0) recurringWeeks = body.recurringWeeks
    if (typeof body.recurringWeekdays === 'number' && body.recurringWeekdays > 0) recurringWeekdays = body.recurringWeekdays
    if (body.recurrenceOngoing === true) recurrenceOngoing = true
  }

  if (!title || !startsAt) {
    return NextResponse.json({ error: 'title and startsAt are required' }, { status: 400 })
  }

  const parsedStartsAt = new Date(startsAt)
  if (isNaN(parsedStartsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid startsAt date' }, { status: 400 })
  }

  // Build all the start datetimes up front so we can save them in one loop.
  // Caps keep a fat-fingered count from creating a thousand events.
  let occurrenceCount = 1
  const startDates: Date[] = []
  if (recurring && recurrenceFrequency === 'WEEKDAYS') {
    // Mon-Fri series: step one calendar day at a time, skipping Sat/Sun.
    // Weekday is judged in UTC; our trainings run in US daytime, so the UTC
    // calendar day matches the US day. If the chosen start lands on a
    // weekend, roll it forward to the next weekday. Ongoing series seed just
    // an initial window; the roll-forward cron keeps them topped up.
    occurrenceCount = recurrenceOngoing
      ? RECURRENCE_WINDOW.WEEKDAYS.target
      : Math.min(Math.max(recurringWeekdays, 1), MAX_RECURRING_WEEKDAYS)
    const cur = new Date(parsedStartsAt)
    while (cur.getUTCDay() === 0 || cur.getUTCDay() === 6) cur.setUTCDate(cur.getUTCDate() + 1)
    for (let i = 0; i < occurrenceCount; i++) {
      startDates.push(new Date(cur))
      do { cur.setUTCDate(cur.getUTCDate() + 1) } while (cur.getUTCDay() === 0 || cur.getUTCDay() === 6)
    }
  } else if (recurring) {
    occurrenceCount = recurrenceOngoing
      ? RECURRENCE_WINDOW.WEEKLY.target
      : Math.min(Math.max(recurringWeeks, 1), MAX_RECURRING_WEEKS)
    for (let i = 0; i < occurrenceCount; i++) {
      const d = new Date(parsedStartsAt)
      d.setDate(d.getDate() + i * 7)
      startDates.push(d)
    }
  } else {
    startDates.push(new Date(parsedStartsAt))
  }

  // Shared payload for every occurrence.
  const sharedData = {
    driveFileId: null,
    driveFileName: null,
    driveModifiedTime: null,
    driveThumbnailUrl: null,
    flyerImageUrl,
    published,
    title,
    subtitle,
    category,
    durationMinutes,
    presenters,
    streamType,
    streamRoomName,
    streamId,
    passcode,
    audienceRestriction,
    partnerBrand,
    targetRegion,
  }

  // Create the parent first so its id can anchor the children.
  const parent = await db.trainingEvent.create({
    data: {
      ...sharedData,
      startsAt: startDates[0],
      recurrenceFrequency: recurring ? recurrenceFrequency : null,
      recurrenceRollForward: recurring && recurrenceOngoing,
    },
  })

  const children = recurring
    ? await Promise.all(startDates.slice(1).map(d =>
        db.trainingEvent.create({
          data: {
            ...sharedData,
            startsAt: d,
            recurrenceParentId: parent.id,
            recurrenceFrequency,
          },
        })
      ))
    : []

  // Create one Discord scheduled event per occurrence. Best-effort —
  // failures are logged but don't block the DB write so admin can re-sync.
  let discordCreated = 0
  if (published && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
    const allEvents = [parent, ...children]
    for (const ev of allEvents) {
      if (ev.startsAt <= new Date()) continue
      try {
        const { createGuildScheduledEvent } = await import('@/lib/discord')
        const endsAt = new Date(ev.startsAt.getTime() + durationMinutes * 60_000)
        const joinUrl = streamId ? `https://zoom.us/j/${streamId.replace(/[\s-]/g, '')}${passcode ? `?pwd=${encodeURIComponent(passcode)}` : ''}` : null
        const pcStr = passcode ? ` · pw ${passcode}` : ''
        const location = joinUrl ? `${joinUrl}`.slice(0, 100) : (streamRoomName ? `${streamRoomName} · ID ${streamId}${pcStr}`.slice(0, 100) : 'TBD')

        const discordEvent = await createGuildScheduledEvent({
          name: title.slice(0, 100),
          description: subtitle ?? '',
          scheduledStartTime: ev.startsAt.toISOString(),
          scheduledEndTime: endsAt.toISOString(),
          location,
        })
        await db.trainingEvent.update({
          where: { id: ev.id },
          data: { discordEventId: discordEvent.id, discordEventCreatedAt: new Date() },
        })
        discordCreated++
      } catch (err) {
        console.error('[trainings/create] Discord event creation failed for', ev.id, err)
      }
    }
  }

  return NextResponse.json({
    event: parent,
    occurrenceCount,
    discordCreated,
    children: children.map(c => ({ id: c.id, startsAt: c.startsAt })),
  })
}
