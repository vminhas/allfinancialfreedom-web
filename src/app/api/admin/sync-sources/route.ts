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

  // ── Backfill historical appointments from GHL calendars ──
  let appointmentsCreated = 0
  try {
    // Get all calendars
    const calRes = await ghlGet(`/calendars/?locationId=${config.locationId}`, config)
    if (calRes.ok) {
      const calData = await calRes.json() as { calendars?: Array<{ id: string; name: string }> }
      const calendars = calData.calendars ?? []

      // Pull events from the last 90 days for each calendar
      const now = new Date()
      const startTime = new Date(now.getTime() - 90 * 86400000).toISOString()
      const endTime = now.toISOString()

      for (const cal of calendars) {
        try {
          const evtRes = await ghlGet(
            `/calendars/events?locationId=${config.locationId}&calendarId=${cal.id}&startTime=${startTime}&endTime=${endTime}`,
            config,
          )
          if (!evtRes.ok) continue

          const evtData = await evtRes.json() as { events?: Array<{
            id: string; calendarId: string; title?: string
            contactId?: string; startTime?: string; endTime?: string
            status?: string; assignedUserId?: string
            appoinmentStatus?: string
          }> }

          for (const evt of evtData.events ?? []) {
            if (!evt.id) continue
            const eventId = evt.id
            const existing = await db.ghlAppointment.findUnique({ where: { ghlEventId: eventId } })
            if (existing) continue

            // Look up the contact for name/email
            let contactName = evt.title ?? 'Unknown'
            let contactEmail: string | null = null
            let contactPhone: string | null = null
            let localContactId: string | null = null

            if (evt.contactId) {
              const cRes = await ghlGet(`/contacts/${evt.contactId}`, config)
              if (cRes.ok) {
                const cData = await cRes.json() as { contact?: { firstName?: string; lastName?: string; email?: string; phone?: string } }
                const gc = cData.contact
                if (gc) {
                  contactName = `${gc.firstName ?? ''} ${gc.lastName ?? ''}`.trim() || contactName
                  contactEmail = gc.email ?? null
                  contactPhone = gc.phone ?? null
                }
              }

              // Find local contact
              if (contactEmail) {
                const local = await db.contact.findUnique({ where: { email: contactEmail.toLowerCase() } })
                localContactId = local?.id ?? null
              }
            }

            await db.ghlAppointment.create({
              data: {
                ghlCalendarId: cal.id,
                ghlEventId: eventId,
                calendarName: cal.name,
                contactId: localContactId ?? undefined,
                contactName,
                contactEmail,
                contactPhone,
                appointmentDate: evt.startTime ? new Date(evt.startTime) : new Date(),
                assignedTo: cal.name,
                source: cal.name,
                status: evt.appoinmentStatus === 'noshow' ? 'NO_SHOW'
                  : evt.appoinmentStatus === 'cancelled' ? 'CANCELLED'
                  : evt.status === 'confirmed' ? 'BOOKED'
                  : 'BOOKED',
              },
            })
            appointmentsCreated++
          }
        } catch (err) {
          errors.push(`calendar ${cal.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  } catch (err) {
    errors.push(`calendars: ${err instanceof Error ? err.message : String(err)}`)
  }

  return NextResponse.json({ ok: true, created, updated, skipped, appointmentsCreated, errors: errors.slice(0, 10) })
}
