import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGhlConfig, ghlPost } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'
import { getBreezySession, getAllBreezyCandidates } from '@/lib/breezy'

// GET /api/cron/breezy-sync (Vercel cron, runs hourly)
//
// Signs into Breezy HR, pulls all "Applied" candidates, and for each:
//   1. Creates/updates a local Contact (source='breezy', stage='Engaged')
//   2. Creates a GHL contact if one doesn't exist (tagged 'breezy')
//   3. Creates a GHL opportunity in the recruiting pipeline
//
// This ensures Breezy candidates appear in both the vault funnel AND
// the GHL dashboard automatically.

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
    return NextResponse.json({ ok: true, synced: 0, reason: 'No applied candidates in Breezy' })
  }

  // GHL config for pushing contacts
  const config = await getGhlConfig()
  const hasGhl = !!(config.apiKey && config.locationId)
  const pipelineId = hasGhl ? (await getSetting('GHL_PIPELINE_ID') || 'j8RckwejQ1VaoH7bQbAf') : null
  // "Engaged" stage ID in GHL — the Responded stage maps to Engaged
  const engagedStageId = hasGhl ? (await getSetting('GHL_STAGE_ENGAGED') || null) : null

  let created = 0
  let updated = 0
  let skipped = 0
  let ghlCreated = 0
  const errors: string[] = []

  for (const c of candidates) {
    try {
      if (!c.email_address) { skipped++; continue }

      const email = c.email_address.toLowerCase().trim()
      const { firstName, lastName } = parseName(c.name || '')
      const phone = c.phone_number ?? null
      // Store granular source: breezy-ziprecruiter, breezy-career-portal, etc.
      const subSource = c.source?.name?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'
      const source = `breezy-${subSource}`

      const existing = await db.contact.findUnique({ where: { email } })

      if (existing) {
        const shouldUpdateStage = !existing.ghlPipelineStage || existing.ghlPipelineStage === 'New Lead'
        await db.contact.update({
          where: { email },
          data: {
            ...(shouldUpdateStage ? { ghlPipelineStage: 'Engaged', ghlStageUpdatedAt: new Date() } : {}),
            ...(existing.source === 'prophog' || !existing.source ? { source } : {}),
          },
        })
        updated++
        continue // Already in system, don't re-create in GHL
      }

      // Create local Contact
      let ghlContactId: string | null = null
      let ghlOpportunityId: string | null = null

      // Push to GHL if configured
      if (hasGhl) {
        try {
          // Create or find GHL contact
          const contactRes = await ghlPost('/contacts/', {
            locationId: config.locationId,
            firstName: firstName || 'Unknown',
            lastName,
            email,
            phone: phone ?? undefined,
            source: 'Breezy',
            tags: ['breezy', 'breezy-applied', `breezy-${subSource}`],
          }, config)

          if (contactRes.ok) {
            const contactData = await contactRes.json() as { contact?: { id: string } }
            ghlContactId = contactData.contact?.id ?? null
          }

          // Create opportunity in pipeline
          if (ghlContactId && pipelineId) {
            const oppRes = await ghlPost('/opportunities/', {
              pipelineId,
              pipelineStageId: engagedStageId ?? undefined,
              locationId: config.locationId,
              contactId: ghlContactId,
              name: `${firstName} ${lastName} - Breezy`.trim(),
              status: 'open',
            }, config)
            if (oppRes.ok) {
              const oppData = await oppRes.json() as { opportunity?: { id: string } }
              ghlOpportunityId = oppData.opportunity?.id ?? null
              ghlCreated++
            }
          }
        } catch (err) {
          console.error(`[breezy-sync] GHL push failed for ${email}:`, err)
        }
      }

      await db.contact.create({
        data: {
          firstName: firstName || 'Unknown',
          lastName,
          email,
          phone,
          source,
          outreachStatus: 'responded',
          ghlPipelineStage: 'Engaged',
          ghlStageUpdatedAt: new Date(),
          ghlContactId,
          ghlOpportunityId,
        },
      })
      created++
    } catch (err) {
      errors.push(`${c.email_address ?? c.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Summary to admin Discord. The sync itself runs hourly so candidates
  // land in Contacts + GHL in real time, but the admin-channel embed
  // only posts during one UTC hour per day (13:00 UTC = 9am ET, matches
  // the other daily crons in vercel.json: daily-outreach,
  // agent-reminders, birthday-greetings, renewal-digest,
  // client-reminders, tevah-sync digest). One morning notification
  // batch instead of an hourly drumbeat.
  const BREEZY_DIGEST_HOUR_UTC = 13
  if (
    new Date().getUTCHours() === BREEZY_DIGEST_HOUR_UTC
    && process.env.DISCORD_BOT_TOKEN
    && process.env.DISCORD_ADMIN_CHANNEL_ID
  ) {
    try {
      // Past-24-hour rollup from the DB. Per-run counts are useless for
      // a daily digest (most hours land 0 new candidates because the
      // previous hour already ate them), so the embed pulls the real
      // daily total from Contact rows.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const dailyCreated = await db.contact.count({
        where: { createdAt: { gte: since }, source: { startsWith: 'breezy' } },
      })
      if (dailyCreated > 0) {
        const { sendChannelMessage } = await import('@/lib/discord')
        await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
          embeds: [{
            title: 'Breezy Daily Digest',
            description: `${dailyCreated} new applicant${dailyCreated === 1 ? '' : 's'} from Breezy in the last 24 hours.`,
            color: 0x38bdf8,
            footer: { text: 'AFF Breezy Daily Digest' },
            timestamp: new Date().toISOString(),
          }],
        })
      }
    } catch (err) {
      console.warn('[breezy-sync] digest post failed:', err)
    }
  }

  return NextResponse.json({
    ok: true,
    total: candidates.length,
    created,
    updated,
    skipped,
    ghlCreated,
    errors: errors.slice(0, 10),
  })
}
