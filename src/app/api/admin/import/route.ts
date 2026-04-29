import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getGhlConfig, ghlPost } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

const BATCH_SIZE = 5
const BATCH_DELAY_MS = 300
const DAILY_CAP = 2400

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function getDailyImportCount(): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const result = await db.importJob.aggregate({
    _sum: { importedCount: true },
    where: { createdAt: { gte: startOfDay }, status: { in: ['RUNNING', 'COMPLETE', 'PAUSED'] } },
  })
  return result._sum.importedCount ?? 0
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { jobId, dryRun = false } = body

  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const job = await db.importJob.findUnique({ where: { id: jobId } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'RUNNING') {
    return NextResponse.json({ error: 'Job already running' }, { status: 409 })
  }

  if (dryRun) {
    // Just return what would happen
    const contacts = await db.contact.findMany({
      where: { importJobId: jobId },
      select: { id: true, email: true, ghlContactId: true },
    })
    const alreadyImported = contacts.filter(c => c.ghlContactId).length
    const pending = contacts.filter(c => !c.ghlContactId).length
    return NextResponse.json({ dryRun: true, total: contacts.length, alreadyImported, pending })
  }

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) {
    return NextResponse.json({ error: 'GHL not configured' }, { status: 400 })
  }

  const pipelineId = await getSetting('GHL_PIPELINE_ID')
  const stageId = await getSetting('GHL_STAGE_APPLICATION_RECEIVED')

  // Pending = anything not yet handed off to GHL AND not previously
  // marked as a permanent skip ('duplicate', 'opted-out', 'failed_permanent').
  // We deliberately do NOT use `skip: lastRowIndex` here — that combined
  // with this filter is what was orphaning rows: as the first batch
  // succeeds, the filtered list shrinks but `skip` keeps indexing
  // against the original size, so middle rows are jumped over and never
  // tried again.
  const pending = await db.contact.findMany({
    where: {
      importJobId: jobId,
      ghlContactId: null,
      NOT: { outreachStatus: { in: ['duplicate', 'opted-out', 'failed_permanent'] } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (pending.length === 0) {
    await db.importJob.update({ where: { id: jobId }, data: { status: 'COMPLETE', completedAt: new Date() } })
    return NextResponse.json({ ok: true, imported: 0, message: 'All contacts already imported' })
  }

  // Check daily cap
  const todayCount = await getDailyImportCount()
  const remaining = DAILY_CAP - todayCount

  if (remaining <= 0) {
    await db.importJob.update({ where: { id: jobId }, data: { status: 'PAUSED' } })
    return NextResponse.json({ ok: true, paused: true, reason: 'Daily limit reached (2,400). Resume tomorrow.' })
  }

  const toProcess = pending.slice(0, remaining)
  await db.importJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } })

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  // Process in batches
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(async (contact) => {
      try {
        const tags = [
          'prophog-recruit',
          contact.wornOut ? 'prophog-worn-out' : 'prophog-fresh',
          contact.licenseType ? `license-${contact.licenseType.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : null,
        ].filter(Boolean) as string[]

        const contactRes = await ghlPost('/contacts/', {
          locationId: config.locationId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone ?? undefined,
          source: 'PropHog Import',
          tags,
          customFields: [
            { key: 'license_type', field_value: contact.licenseType ?? '' },
            { key: 'current_agency', field_value: contact.currentAgency ?? '' },
            { key: 'prophog_source_date', field_value: new Date().toISOString().split('T')[0] },
          ].filter(f => f.field_value),
        }, config)

        if (!contactRes.ok) {
          const errText = await contactRes.text()
          // 409 = duplicate. We mark `outreachStatus = 'duplicate'` AND
          // try to attach the existing GHL id by searching for the
          // email — without that, the row stays ghlContactId=null and
          // re-enters the pending queue on every subsequent run, eating
          // through the daily cap and never advancing.
          if (contactRes.status === 409) {
            let existingGhlId: string | null = null
            try {
              const lookupRes = await fetch(
                `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${config.locationId}&email=${encodeURIComponent(contact.email)}`,
                { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } },
              )
              if (lookupRes.ok) {
                const data = await lookupRes.json() as { contact?: { id: string } }
                existingGhlId = data.contact?.id ?? null
              }
            } catch { /* fall back to status-only mark */ }
            await db.contact.update({
              where: { id: contact.id },
              data: {
                outreachStatus: 'duplicate',
                ghlContactId: existingGhlId, // unique constraint may collide; caught below
              },
            }).catch(async () => {
              // Either GHL lookup failed or another contact row already
              // owns that ghlContactId. Either way, mark it so we stop
              // retrying — duplicates don't need to keep banging GHL.
              await db.contact.update({
                where: { id: contact.id },
                data: { outreachStatus: 'duplicate' },
              })
            })
            skipped++
            return
          }
          // Permanent failure markers keep these rows out of the next
          // pending pull. Treat 4xx (other than rate-limit) as permanent.
          const isPermanent = contactRes.status >= 400 && contactRes.status < 500 && contactRes.status !== 429
          if (isPermanent) {
            await db.contact.update({
              where: { id: contact.id },
              data: { outreachStatus: 'failed_permanent' },
            })
          }
          errors.push(`${contact.email}: ${contactRes.status} ${errText.slice(0, 200)}`)
          return
        }

        const ghlData = await contactRes.json()
        const ghlContactId = ghlData.contact?.id

        if (ghlContactId) {
          await db.contact.update({
            where: { id: contact.id },
            data: { ghlContactId, outreachStatus: 'pending' },
          })

          // Add to pipeline if configured
          if (pipelineId && stageId) {
            await ghlPost('/opportunities/', {
              pipelineId,
              pipelineStageId: stageId,
              locationId: config.locationId,
              name: `${contact.firstName} ${contact.lastName} — PropHog`,
              contactId: ghlContactId,
              status: 'open',
            }, config)
          }

          imported++
        }
      } catch (err) {
        errors.push(`${contact.email}: ${String(err)}`)
      }
    }))

    if (i + BATCH_SIZE < toProcess.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // Status is derived from the actual queue: if anything is still in
  // `pending` (ghlContactId null AND not marked permanent), we're not
  // done. Don't infer completion from row counters — those got us into
  // this mess in the first place.
  const stillPending = await db.contact.count({
    where: {
      importJobId: jobId,
      ghlContactId: null,
      NOT: { outreachStatus: { in: ['duplicate', 'opted-out', 'failed_permanent'] } },
    },
  })

  await db.importJob.update({
    where: { id: jobId },
    data: {
      importedCount: { increment: imported },
      skippedCount: { increment: skipped },
      errorCount: { increment: errors.length },
      // lastRowIndex is now informational only (kept for the dashboard
      // progress bar). The fixed pending query doesn't use it.
      lastRowIndex: { increment: toProcess.length },
      status: stillPending === 0 ? 'COMPLETE' : 'PAUSED',
      completedAt: stillPending === 0 ? new Date() : null,
    },
  })

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    errors: errors.slice(0, 10),
    paused: job.lastRowIndex + toProcess.length < job.totalRows,
  })
}
