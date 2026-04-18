import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PHASE_ITEMS, PHASE_LABELS } from '@/lib/agent-constants'
import { getGhlConfig, sendGhlEmail, ghlPost } from '@/lib/ghl'
import type { GhlConfig } from '@/lib/ghl'

const PHASE_THRESHOLDS: Record<number, { daysMin: number; completionMax: number }> = {
  1: { daysMin: 7, completionMax: 0.8 },
  2: { daysMin: 30, completionMax: 0.5 },
  3: { daysMin: 45, completionMax: 0.5 },
  4: { daysMin: 60, completionMax: 0.5 },
  5: { daysMin: 90, completionMax: 0.5 },
}

const REMINDER_COOLDOWN_DAYS = 3

async function findOrCreateGhlContact(
  email: string,
  firstName: string,
  lastName: string,
  phone: string | null,
  config: GhlConfig,
): Promise<string | null> {
  const searchRes = await fetch(
    `https://services.leadconnectorhq.com/contacts/search?locationId=${config.locationId}&query=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Version: '2021-07-28',
      },
    },
  )
  const searchData = (await searchRes.json()) as { contacts?: { id: string }[] }
  if (searchData.contacts?.[0]?.id) return searchData.contacts[0].id

  const createRes = await ghlPost(
    '/contacts/',
    {
      locationId: config.locationId,
      email,
      firstName,
      lastName,
      phone: phone ?? undefined,
      tags: ['agent-portal'],
    },
    config,
  )
  const createData = (await createRes.json()) as { contact?: { id: string } }
  return createData.contact?.id ?? null
}

function buildReminderHtml(
  firstName: string,
  phase: number,
  completed: number,
  total: number,
  daysInPhase: number,
  remainingItems: { label: string; duration?: string }[],
  portalUrl: string,
): string {
  const phaseTitle = PHASE_LABELS[phase]?.title ?? `Phase ${phase}`
  const itemList = remainingItems
    .slice(0, 10)
    .map(i => `<li style="color:#9BB0C4;margin-bottom:6px;">${i.label}${i.duration ? ` <span style="color:#4B5563;">(${i.duration})</span>` : ''}</li>`)
    .join('')
  const moreCount = remainingItems.length > 10 ? remainingItems.length - 10 : 0

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0C1E30;color:#ffffff;border-radius:8px;">
      <h2 style="color:#C9A96E;margin-bottom:8px;">Your Phase ${phase} Checklist</h2>
      <p style="color:#9BB0C4;">Hi ${firstName},</p>
      <p style="color:#9BB0C4;">You've completed <strong style="color:#C9A96E;">${completed} of ${total}</strong> items in <strong style="color:#ffffff;">Phase ${phase}: ${phaseTitle}</strong>. You started ${daysInPhase} days ago.</p>
      <p style="color:#9BB0C4;">Here's what's still open:</p>
      <ul style="padding-left:20px;margin:16px 0;">${itemList}</ul>
      ${moreCount > 0 ? `<p style="color:#4B5563;font-size:13px;">...and ${moreCount} more items</p>` : ''}
      <a href="${portalUrl}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#C9A96E;color:#142D48;font-weight:700;text-decoration:none;border-radius:4px;font-size:15px;">
        Open Your Portal
      </a>
      <p style="color:#6B8299;font-size:13px;">Your trainer is here to help. Reach out if you need anything.</p>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:24px 0;" />
      <p style="color:#4B5563;font-size:11px;margin:0;">All Financial Freedom</p>
    </div>
  `
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const cooldownDate = new Date(now.getTime() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)

  const agents = await db.agentProfile.findMany({
    where: {
      status: 'ACTIVE',
      phaseStartedAt: { not: null },
      agentUser: { passwordHash: { not: null } },
      OR: [
        { lastReminderSentAt: null },
        { lastReminderSentAt: { lt: cooldownDate } },
      ],
    },
    include: {
      agentUser: { select: { email: true } },
      phaseItems: { select: { phase: true, itemKey: true, completed: true } },
    },
  })

  let config: GhlConfig | null = null
  try {
    config = await getGhlConfig()
    if (!config.apiKey || !config.locationId) config = null
  } catch {
    config = null
  }

  if (!config) {
    return NextResponse.json({ error: 'GHL not configured', sent: 0 })
  }

  const portalUrl = `${process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'}/agents`
  let sent = 0
  const errors: string[] = []

  for (const agent of agents) {
    const threshold = PHASE_THRESHOLDS[agent.phase]
    if (!threshold || !agent.phaseStartedAt) continue

    const daysInPhase = Math.floor((now.getTime() - agent.phaseStartedAt.getTime()) / (1000 * 60 * 60 * 24))
    if (daysInPhase < threshold.daysMin) continue

    const phaseItemDefs = PHASE_ITEMS[agent.phase] ?? []
    const total = phaseItemDefs.length
    if (total === 0) continue

    const completedKeys = new Set(
      agent.phaseItems
        .filter(pi => pi.phase === agent.phase && pi.completed)
        .map(pi => pi.itemKey),
    )
    const completed = completedKeys.size
    const completionPct = completed / total

    if (completionPct >= threshold.completionMax) continue

    const remainingItems = phaseItemDefs
      .filter(item => !completedKeys.has(item.key))
      .map(item => ({ label: item.label, duration: item.duration }))

    try {
      const contactId = await findOrCreateGhlContact(
        agent.agentUser.email,
        agent.firstName,
        agent.lastName,
        agent.phone,
        config,
      )
      if (!contactId) {
        errors.push(`${agent.firstName} ${agent.lastName}: no GHL contact`)
        continue
      }

      const html = buildReminderHtml(
        agent.firstName,
        agent.phase,
        completed,
        total,
        daysInPhase,
        remainingItems,
        portalUrl,
      )

      const res = await sendGhlEmail({
        contactId,
        emailTo: agent.agentUser.email,
        subject: `Your Phase ${agent.phase} checklist — let's get you caught up`,
        html,
        config,
      })

      if (res.ok) {
        await db.agentProfile.update({
          where: { id: agent.id },
          data: { lastReminderSentAt: now },
        })
        sent++
      } else {
        errors.push(`${agent.firstName} ${agent.lastName}: GHL ${res.status}`)
      }
    } catch (err) {
      errors.push(`${agent.firstName} ${agent.lastName}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ sent, checked: agents.length, errors: errors.slice(0, 10) })
}
