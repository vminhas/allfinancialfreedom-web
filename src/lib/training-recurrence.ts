import { db } from '@/lib/db'
import type { Prisma, TrainingEvent } from '@/generated/prisma/client'

// Rolling-window targets for an ongoing (auto-extending) series. `target`
// is how many future occurrences we keep scheduled; `min` is the low-water
// mark that triggers a top-up. Weekday windows are larger in count but
// similar in calendar span (~3 weeks). Kept modest so the active Discord
// scheduled-event count per series stays well under the guild cap (~100).
export const RECURRENCE_WINDOW: Record<string, { min: number; target: number }> = {
  WEEKLY:   { min: 6,  target: 8 },
  WEEKDAYS: { min: 10, target: 15 },
}

// Advance one occurrence. WEEKDAYS steps a calendar day at a time and skips
// Sat/Sun; WEEKLY steps 7 days. Weekday is judged in UTC, which matches the
// US calendar day for our daytime trainings. Time-of-day is preserved.
export function stepOccurrence(from: Date, freq: string): Date {
  const d = new Date(from)
  if (freq === 'WEEKDAYS') {
    do { d.setUTCDate(d.getUTCDate() + 1) } while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  } else {
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return d
}

// Create the Discord scheduled event for a single occurrence and stamp its
// id back onto the row. Best-effort: returns true on success, false if
// skipped (past / unpublished / no Discord env / already has one) or on
// error. Mirrors the per-occurrence logic in the manual create route.
export async function createDiscordEventForOccurrence(ev: TrainingEvent): Promise<boolean> {
  if (!ev.published || ev.discordEventId || ev.startsAt <= new Date()) return false
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID) return false
  try {
    const { createGuildScheduledEvent } = await import('@/lib/discord')
    const endsAt = new Date(ev.startsAt.getTime() + ev.durationMinutes * 60_000)
    const joinUrl = ev.streamId
      ? `https://zoom.us/j/${ev.streamId.replace(/[\s-]/g, '')}${ev.passcode ? `?pwd=${encodeURIComponent(ev.passcode)}` : ''}`
      : null
    const pcStr = ev.passcode ? ` · pw ${ev.passcode}` : ''
    const location = joinUrl
      ? joinUrl.slice(0, 100)
      : (ev.streamRoomName ? `${ev.streamRoomName} · ID ${ev.streamId}${pcStr}`.slice(0, 100) : 'TBD')
    const discordEvent = await createGuildScheduledEvent({
      name: ev.title.slice(0, 100),
      description: ev.subtitle ?? '',
      scheduledStartTime: ev.startsAt.toISOString(),
      scheduledEndTime: endsAt.toISOString(),
      location,
    })
    await db.trainingEvent.update({
      where: { id: ev.id },
      data: { discordEventId: discordEvent.id, discordEventCreatedAt: new Date() },
    })
    return true
  } catch (err) {
    console.warn('[training-roll-forward] discord event failed for', ev.id, err)
    return false
  }
}

// Top up every ongoing recurring series so it always has a full window of
// future occurrences scheduled. Idempotent: only adds when a series has
// dropped below its low-water mark, and only ever fills up to `target`.
export async function rollForwardRecurringTrainings() {
  const now = new Date()
  const parents = await db.trainingEvent.findMany({
    where: {
      recurrenceParentId: null,
      recurrenceRollForward: true,
      published: true,
      recurrenceFrequency: { not: null },
    },
    include: { recurrenceChildren: { select: { startsAt: true } } },
  })

  let seriesExtended = 0
  let occurrencesAdded = 0
  let discordCreated = 0

  for (const parent of parents) {
    const freq = parent.recurrenceFrequency as string
    const win = RECURRENCE_WINDOW[freq] ?? RECURRENCE_WINDOW.WEEKLY
    const allStarts = [parent.startsAt, ...parent.recurrenceChildren.map(c => c.startsAt)]
    const futureCount = allStarts.filter(s => s > now).length
    if (futureCount >= win.min) continue

    let last = allStarts.reduce((m, s) => (s > m ? s : m), allStarts[0])
    const toAdd = win.target - futureCount

    for (let i = 0; i < toAdd; i++) {
      last = stepOccurrence(last, freq)
      const child = await db.trainingEvent.create({
        data: {
          flyerImageUrl: parent.flyerImageUrl,
          published: parent.published,
          title: parent.title,
          subtitle: parent.subtitle,
          category: parent.category,
          durationMinutes: parent.durationMinutes,
          presenters: (parent.presenters ?? []) as Prisma.InputJsonValue,
          streamType: parent.streamType,
          streamRoomName: parent.streamRoomName,
          streamId: parent.streamId,
          passcode: parent.passcode,
          audienceRestriction: parent.audienceRestriction,
          partnerBrand: parent.partnerBrand,
          targetRegion: parent.targetRegion,
          startsAt: last,
          recurrenceParentId: parent.id,
          recurrenceFrequency: freq,
        },
      })
      occurrencesAdded++
      if (await createDiscordEventForOccurrence(child)) discordCreated++
    }
    seriesExtended++
  }

  return { seriesExtended, occurrencesAdded, discordCreated }
}
