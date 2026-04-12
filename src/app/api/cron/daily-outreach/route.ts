import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { getGhlConfig, sendGhlEmail } from '@/lib/ghl'

const RAMP = [50, 150, 300, 500]

function getDailyLimit(startDate: Date): number {
  const daysSince = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const week = Math.floor(daysSince / 7)
  return RAMP[Math.min(week, RAMP.length - 1)]
}

function normalizeLicense(raw?: string | null): string {
  if (!raw) return 'insurance'
  const r = raw.toLowerCase()
  if (r.includes('accident') && r.includes('health') && r.includes('life')) return 'life and health insurance'
  if (r.includes('accident') && r.includes('health')) return 'health insurance'
  if (r === 'life') return 'life insurance'
  if (r.includes('life')) return 'life insurance'
  if (r.includes('property') || r.includes('casualty') || r === 'p&c') return 'property and casualty insurance'
  if (r.includes('variable')) return 'variable annuity'
  if (r.includes('health')) return 'health insurance'
  return raw
}

function applyTokens(text: string, c: { firstName: string; licenseType?: string | null; state?: string | null; currentAgency?: string | null }): string {
  return text
    .replace(/\{\{firstName\}\}/g, c.firstName)
    .replace(/\{\{licenseType\}\}/g, normalizeLicense(c.licenseType))
    .replace(/\{\{state\}\}/g, c.state || 'your state')
    .replace(/\{\{currentAgency\}\}/g, c.currentAgency || 'your current agency')
}

function buildHtml(body: string, email: string): string {
  const unsubUrl = `https://www.allfinancialfreedom.com/unsubscribe?email=${encodeURIComponent(email)}`
  const plain = `${body.trim()}\n\n--\nVick Minhas\nvick@allfinancialfreedom.com\n\nTo stop receiving emails: ${unsubUrl}`
  return plain.replace(/\n/g, '<br>')
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [enabled, startDateStr, templateJson] = await Promise.all([
    getSetting('AUTO_SEND_ENABLED'),
    getSetting('AUTO_SEND_START_DATE'),
    getSetting('AUTO_SEND_DEFAULT_TEMPLATE'),
  ])

  if (enabled !== 'true') {
    return NextResponse.json({ skipped: true, reason: 'Auto-send disabled' })
  }
  if (!templateJson) {
    return NextResponse.json({ skipped: true, reason: 'No default template configured' })
  }

  const template = JSON.parse(templateJson) as { name: string; subject: string; body: string }
  const startDate = startDateStr ? new Date(startDateStr) : new Date()
  const dailyLimit = getDailyLimit(startDate)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const sentToday = await db.outreachMessage.count({
    where: { sentAt: { gte: todayStart }, status: 'SENT' },
  })

  const toSend = dailyLimit - sentToday
  if (toSend <= 0) {
    return NextResponse.json({ skipped: true, reason: `Daily limit of ${dailyLimit} already reached`, sentToday })
  }

  const contacts = await db.contact.findMany({
    where: {
      outreachStatus: 'pending',
      ghlContactId: { not: null },
      email: { not: undefined },
    },
    take: toSend,
    orderBy: { createdAt: 'asc' },
  })

  if (contacts.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'No pending contacts in queue' })
  }

  const config = await getGhlConfig()
  let sent = 0
  const errors: string[] = []

  for (const contact of contacts) {
    try {
      const subject = applyTokens(template.subject, contact)
      const body = applyTokens(template.body, contact)
      const html = buildHtml(body, contact.email!)

      const res = await sendGhlEmail({
        contactId: contact.ghlContactId!,
        emailTo: contact.email!,
        subject,
        html,
        config,
      })

      if (!res.ok) {
        errors.push(`${contact.email}: GHL ${res.status}`)
        continue
      }

      const ghlData = await res.json()

      await db.outreachMessage.create({
        data: {
          contactId: contact.id,
          subject,
          bodyHtml: html,
          status: 'SENT',
          sentAt: new Date(),
          ghlMessageId: ghlData.messageId ?? ghlData.id ?? null,
          inputTokens: 0,
          outputTokens: 0,
        },
      })

      await db.contact.update({
        where: { id: contact.id },
        data: { outreachStatus: 'sent' },
      })

      sent++
    } catch (err) {
      errors.push(`${contact.email}: ${String(err)}`)
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.slice(0, 10), dailyLimit, sentToday: sentToday + sent })
}
