import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBreezySession, getAllBreezyCandidates, type BreezyCandidate } from '@/lib/breezy'

// GET /api/cron/breezy-sync (Vercel cron, runs hourly)
//
// Signs into Breezy HR, pulls all candidates across all positions,
// and upserts them as Contacts with source='breezy'. Maps Breezy
// pipeline stages to AFF funnel stages so candidates show up in
// the recruiting funnel automatically.

const BREEZY_STAGE_MAP: Record<string, string> = {
  'new':             'New Lead',
  'lead':            'New Lead',
  'applied':         'Engaged',
  'phone screen':    'Discovery Booked',
  'interview':       'Interview Booked',
  'offer':           'Onboarding',
  'hired':           'Active Agent',
  'rejected':        'Not Interested',
  'disqualified':    'Not Qualified',
  'withdrawn':       'Not Interested',
}

function mapBreezyStage(breezyStageName?: string): string {
  if (!breezyStageName) return 'New Lead'
  const lower = breezyStageName.toLowerCase()
  // Check exact matches first, then partial
  if (BREEZY_STAGE_MAP[lower]) return BREEZY_STAGE_MAP[lower]
  for (const [key, val] of Object.entries(BREEZY_STAGE_MAP)) {
    if (lower.includes(key)) return val
  }
  return 'Engaged' // default: they applied, so they're engaged
}

function parseName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.BREEZY_EMAIL || !process.env.BREEZY_PASSWORD) {
    return NextResponse.json({ skipped: true, reason: 'Breezy credentials not configured' })
  }

  let session
  try {
    session = await getBreezySession()
  } catch (err) {
    return NextResponse.json({ error: `Breezy sign-in failed: ${err}` }, { status: 500 })
  }

  const candidates = await getAllBreezyCandidates(session)
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, reason: 'No candidates found in Breezy' })
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const c of candidates) {
    try {
      if (!c.email_address) { skipped++; continue }

      const email = c.email_address.toLowerCase().trim()
      const { firstName, lastName } = parseName(c.name || '')
      const affStage = mapBreezyStage(c.stage?.name)

      const existing = await db.contact.findUnique({ where: { email } })

      if (existing) {
        // Only update stage if Breezy is further along than current
        // Don't overwrite source if they came from somewhere else first
        const shouldUpdateStage = !existing.ghlPipelineStage || existing.ghlPipelineStage === 'New Lead'
        await db.contact.update({
          where: { email },
          data: {
            ...(shouldUpdateStage ? { ghlPipelineStage: affStage, ghlStageUpdatedAt: new Date() } : {}),
            // Preserve original source if set to something meaningful
            ...(existing.source === 'prophog' || !existing.source ? { source: 'breezy' } : {}),
          },
        })
        updated++
      } else {
        await db.contact.create({
          data: {
            firstName: firstName || 'Unknown',
            lastName,
            email,
            phone: c.phone_number ?? null,
            source: 'breezy',
            outreachStatus: 'responded',
            ghlPipelineStage: affStage,
            ghlStageUpdatedAt: new Date(),
          },
        })
        created++
      }
    } catch (err) {
      errors.push(`${c.email_address ?? c.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Summary to admin Discord
  if ((created > 0 || updated > 0) && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: 'Breezy Sync Complete',
          description: `Created: ${created} · Updated: ${updated} · Skipped: ${skipped}`,
          color: 0x38bdf8,
          footer: { text: 'AFF Breezy Sync' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {})
    } catch {}
  }

  return NextResponse.json({
    ok: true,
    total: candidates.length,
    created,
    updated,
    skipped,
    errors: errors.slice(0, 10),
  })
}
