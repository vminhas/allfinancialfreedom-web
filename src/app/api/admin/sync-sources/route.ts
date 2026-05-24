import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { getGhlConfig, ghlGet, ghlPost } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

// POST /api/admin/sync-sources
//
// Manual sync button: pulls contacts from GHL by tag and creates local
// Contact records with proper source attribution. Also backfills any
// join-applicant contacts (Instagram) that were only in GHL before.
//
// This complements the automated crons — admin can trigger it any time
// from the funnel page to catch up immediately.

const TAG_SOURCE_MAP: Record<string, string> = {
  'join-applicant': 'instagram',
  'instagram': 'instagram',
  'breezy': 'breezy',
  'breezy-applied': 'breezy',
  'prophog-recruit': 'prophog',
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) {
    return NextResponse.json({ error: 'GHL not configured' }, { status: 400 })
  }

  const pipelineId = await getSetting('GHL_PIPELINE_ID') || 'j8RckwejQ1VaoH7bQbAf'

  // Pull all contacts from GHL with source-related tags
  const tagsToSync = Object.keys(TAG_SOURCE_MAP)
  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const tag of tagsToSync) {
    try {
      // Search GHL contacts by tag
      const searchRes = await ghlGet(
        `/contacts/?locationId=${config.locationId}&query=${encodeURIComponent(tag)}&limit=100`,
        config,
      )
      if (!searchRes.ok) continue

      const data = await searchRes.json() as { contacts?: Array<{
        id: string; firstName?: string; lastName?: string; email?: string
        phone?: string; tags?: string[]; source?: string
      }> }

      const contacts = (data.contacts ?? []).filter(c =>
        c.tags?.some(t => t.toLowerCase() === tag.toLowerCase()),
      )

      for (const c of contacts) {
        if (!c.email) { skipped++; continue }
        const email = c.email.toLowerCase().trim()
        const source = TAG_SOURCE_MAP[tag]

        const existing = await db.contact.findUnique({ where: { email } })

        if (existing) {
          // Update source if it's currently generic
          const genericSources = ['prophog', 'unknown', '']
          if (genericSources.includes(existing.source) && source !== 'prophog') {
            await db.contact.update({
              where: { email },
              data: { source, ghlContactId: existing.ghlContactId ?? c.id },
            })
            updated++
          } else {
            skipped++
          }
        } else {
          // Create new contact
          await db.contact.create({
            data: {
              firstName: c.firstName ?? 'Unknown',
              lastName: c.lastName ?? '',
              email,
              phone: c.phone ?? null,
              source,
              ghlContactId: c.id,
              outreachStatus: 'responded',
              ghlPipelineStage: 'Engaged',
              ghlStageUpdatedAt: new Date(),
            },
          })
          created++
        }
      }
    } catch (err) {
      errors.push(`tag ${tag}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Also pull opportunities from the pipeline to catch anyone we missed
  try {
    const oppRes = await ghlGet(
      `/opportunities/search?location_id=${config.locationId}&pipeline_id=${pipelineId}&limit=100`,
      config,
    )
    if (oppRes.ok) {
      const oppData = await oppRes.json() as { opportunities?: Array<{
        id: string; contact: { id: string; name: string; email?: string; phone?: string }
        pipelineStageId: string; status: string
      }> }
      for (const opp of oppData.opportunities ?? []) {
        if (!opp.contact?.email) continue
        const email = opp.contact.email.toLowerCase().trim()
        const existing = await db.contact.findUnique({ where: { email } })
        if (!existing) {
          const [firstName, ...rest] = (opp.contact.name ?? '').split(' ')
          await db.contact.create({
            data: {
              firstName: firstName || 'Unknown',
              lastName: rest.join(' '),
              email,
              phone: opp.contact.phone ?? null,
              source: 'website',
              ghlContactId: opp.contact.id,
              ghlOpportunityId: opp.id,
              outreachStatus: 'responded',
              ghlPipelineStage: 'Engaged',
              ghlStageUpdatedAt: new Date(),
            },
          })
          created++
        }
      }
    }
  } catch (err) {
    errors.push(`pipeline: ${err instanceof Error ? err.message : String(err)}`)
  }

  return NextResponse.json({ ok: true, created, updated, skipped, errors: errors.slice(0, 10) })
}
