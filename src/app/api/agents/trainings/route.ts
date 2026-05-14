import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/agents/trainings
//
// Returns the schedule of upcoming + recently-ended training events
// for the agent portal. Same data the vault tracker uses, filtered to
// `published: true` and trimmed to a 60-day forward window plus a
// 7-day rear-view so an agent can still grab a flyer for a training
// they missed yesterday. Auth: agent / admin / licensing_coordinator.
//
// We expose only fields the agent UI needs to render the card:
//   - Identity (title, subtitle, category)
//   - Schedule (startsAt UTC, durationMinutes)
//   - Visual (flyerImageUrl — public Vercel Blob URL)
//   - Connect (streamType, streamRoomName, streamId, passcode,
//     audienceRestriction so the page can show a "Limited audience"
//     badge if applicable)
//   - Presenters
// Internal fields (Drive metadata, parse cost, reminderSentAt, etc.)
// stay server-side.

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || (role !== 'agent' && role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const lookBack = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lookAhead = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  const events = await db.trainingEvent.findMany({
    where: {
      published: true,
      title: { not: '' },
      startsAt: { gte: lookBack, lte: lookAhead },
    },
    select: {
      id: true,
      title: true,
      subtitle: true,
      category: true,
      startsAt: true,
      durationMinutes: true,
      flyerImageUrl: true,
      streamType: true,
      streamRoomName: true,
      streamId: true,
      passcode: true,
      audienceRestriction: true,
      partnerBrand: true,
      targetRegion: true,
      presenters: true,
    },
    orderBy: { startsAt: 'asc' },
  })

  return NextResponse.json({
    trainings: events.map(e => ({
      id: e.id,
      title: e.title,
      subtitle: e.subtitle,
      category: e.category,
      startsAt: e.startsAt.toISOString(),
      durationMinutes: e.durationMinutes,
      flyerImageUrl: e.flyerImageUrl,
      streamType: e.streamType,
      streamRoomName: e.streamRoomName,
      streamId: e.streamId,
      passcode: e.passcode,
      audienceRestriction: e.audienceRestriction,
      partnerBrand: e.partnerBrand,
      targetRegion: e.targetRegion,
      presenters: Array.isArray(e.presenters) ? e.presenters : [],
    })),
  })
}
