import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/settings'

const RAMP = [50, 150, 300, 500]

function getDailyLimit(startDate: Date): number {
  const daysSince = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const week = Math.floor(daysSince / 7)
  return RAMP[Math.min(week, RAMP.length - 1)]
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [enabled, startDateStr, templateJson] = await Promise.all([
    getSetting('AUTO_SEND_ENABLED'),
    getSetting('AUTO_SEND_START_DATE'),
    getSetting('AUTO_SEND_DEFAULT_TEMPLATE'),
  ])

  const startDate = startDateStr ? new Date(startDateStr) : null
  const dailyLimit = startDate ? getDailyLimit(startDate) : RAMP[0]
  const week = startDate ? Math.min(Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)), RAMP.length - 1) : 0

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [sentToday, queueDepth] = await Promise.all([
    db.outreachMessage.count({ where: { sentAt: { gte: todayStart }, status: 'SENT' } }),
    db.contact.count({ where: { outreachStatus: 'pending', ghlContactId: { not: null } } }),
  ])

  const template = templateJson ? JSON.parse(templateJson) as { name: string } : null

  return NextResponse.json({
    enabled: enabled === 'true',
    startDate: startDateStr ?? null,
    dailyLimit,
    week: week + 1,
    sentToday,
    queueDepth,
    templateName: template?.name ?? null,
    ramp: RAMP,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    enabled?: boolean
    template?: { name: string; subject: string; body: string }
    resetStartDate?: boolean
  }

  if (body.template !== undefined) {
    await setSetting('AUTO_SEND_DEFAULT_TEMPLATE', JSON.stringify(body.template))
  }

  if (body.enabled !== undefined) {
    await setSetting('AUTO_SEND_ENABLED', body.enabled ? 'true' : 'false')
    // Set start date when first enabled
    if (body.enabled) {
      const existing = await getSetting('AUTO_SEND_START_DATE')
      if (!existing || body.resetStartDate) {
        await setSetting('AUTO_SEND_START_DATE', new Date().toISOString())
      }
    }
  }

  if (body.resetStartDate) {
    await setSetting('AUTO_SEND_START_DATE', new Date().toISOString())
  }

  return NextResponse.json({ ok: true })
}
