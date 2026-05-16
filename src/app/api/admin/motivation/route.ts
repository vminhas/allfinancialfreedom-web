import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import {
  ensureMotivationSeeded,
  isMotivationEnabled,
  getMotivationChannelId,
  setMotivationEnabled,
  setMotivationChannelId,
  getQuoteForDate,
} from '@/lib/motivation'

// GET    /api/admin/motivation        list library + settings + today's pick
// POST   /api/admin/motivation        add a line
// PATCH  /api/admin/motivation        update settings (enabled / channel)
//
// Per-line edit + delete live at /api/admin/motivation/[id].
// Manual send lives at /api/admin/motivation/send-now.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  await ensureMotivationSeeded()

  const [quotes, enabled, channelId, today] = await Promise.all([
    db.motivationQuote.findMany({
      orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, text: true, voice: true, active: true, sortKey: true },
    }),
    isMotivationEnabled(),
    getMotivationChannelId(),
    getQuoteForDate(),
  ])

  return NextResponse.json({
    quotes,
    activeCount: quotes.filter(q => q.active).length,
    settings: { enabled, channelId },
    today,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { text?: string; voice?: string }
  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.includes('—')) {
    return NextResponse.json({ error: 'No em-dashes allowed in posted copy.' }, { status: 400 })
  }

  // Append to the end of the rotation.
  const max = await db.motivationQuote.aggregate({ _max: { sortKey: true } })
  const userName = (session?.user as { name?: string } | undefined)?.name ?? null

  const quote = await db.motivationQuote.create({
    data: {
      text,
      voice: body.voice?.trim() || 'classic',
      sortKey: (max._max.sortKey ?? 0) + 1,
      createdBy: userName,
    },
    select: { id: true, text: true, voice: true, active: true, sortKey: true },
  })

  return NextResponse.json({ quote })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { enabled?: boolean; channelId?: string }

  if (typeof body.enabled === 'boolean') {
    await setMotivationEnabled(body.enabled)
  }
  if (typeof body.channelId === 'string') {
    const trimmed = body.channelId.trim()
    // Discord snowflakes are numeric. Empty clears back to env/default.
    if (trimmed && !/^\d{5,25}$/.test(trimmed)) {
      return NextResponse.json({ error: 'Channel ID must be a Discord channel ID (numbers only).' }, { status: 400 })
    }
    await setMotivationChannelId(trimmed)
  }

  const [enabled, channelId] = await Promise.all([
    isMotivationEnabled(),
    getMotivationChannelId(),
  ])
  return NextResponse.json({ settings: { enabled, channelId } })
}
