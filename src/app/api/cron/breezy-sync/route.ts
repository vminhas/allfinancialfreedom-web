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

  // Summary to admin Discord
  if ((created > 0 || updated > 0) && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: 'Breezy Sync Complete',
          description: [
            `New: ${created} · Updated: ${updated} · Skipped: ${skipped}`,
            ghlCreated > 0 ? `GHL contacts created: ${ghlCreated}` : '',
          ].filter(Boolean).join('\n'),
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
    ghlCreated,
    errors: errors.slice(0, 10),
  })
}
