import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getGhlConfig, ghlPost } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

// Allow the longest window the platform gives us; we still self-limit
// well under this and hand the rest back to the client to resume.
export const maxDuration = 300

const BATCH_SIZE = 5
const BATCH_DELAY_MS = 300
const DAILY_CAP = 2400
// Hard wall-clock budget for a single invocation. Far below maxDuration
// so we always reach the progress-flush + status write before the
// platform kills us. The client re-POSTs to drain the rest.
const TIME_BUDGET_MS = 45_000
// A RUNNING job whose heartbeat is older than this was killed
// mid-flight (serverless timeout); it's safe to take over and resume.
const STALE_LOCK_MS = 90_000

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

  // Only block if another invocation is genuinely in-flight (fresh
  // heartbeat). A RUNNING job with a stale/absent heartbeat was killed
  // by a serverless timeout — take it over and resume instead of
  // wedging it forever behind a 409.
  if (job.status === 'RUNNING') {
    const heartbeat = job.startedAt?.getTime() ?? 0
    if (Date.now() - heartbeat < STALE_LOCK_MS) {
      return NextResponse.json({ error: 'Job already running' }, { status: 409 })
    }
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
    return NextResponse.json({ ok: true, paused: true, dailyCap: true, hasMore: false, reason: 'Daily limit reached (2,400). Resume tomorrow.' })
  }

  const toProcess = pending.slice(0, remaining)
  await db.importJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  let imported = 0
  let skipped = 0
  const errors: string[] = []
  // Track what's already been written to the job row so each flush
  // only increments the delta (no double-counting).
  let flushedImported = 0
  let flushedSkipped = 0
  let flushedErrors = 0
  const deadline = Date.now() + TIME_BUDGET_MS
  let hitTimeBudget = false

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

    // Flush progress + refresh the heartbeat after every batch. This is
    // what makes the progress bar move and, critically, means a
    // platform kill mid-import never loses what already landed (the
    // next invocation resumes from the live counters / pending queue).
    await db.importJob.update({
      where: { id: jobId },
      data: {
        importedCount: { increment: imported - flushedImported },
        skippedCount: { increment: skipped - flushedSkipped },
        errorCount: { increment: errors.length - flushedErrors },
        lastRowIndex: { increment: Math.min(BATCH_SIZE, toProcess.length - i) },
        startedAt: new Date(),
      },
    })
    flushedImported = imported
    flushedSkipped = skipped
    flushedErrors = errors.length

    if (Date.now() > deadline) {
      hitTimeBudget = true
      break
    }

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

  // We had to truncate this run because the daily cap left less room
  // than there was pending work — the remainder can't be touched until
  // the cap resets, even though more is still pending.
  const dailyCap = pending.length > toProcess.length
  const done = stillPending === 0

  await db.importJob.update({
    where: { id: jobId },
    data: {
      // Counters were already flushed per batch; only the trailing
      // delta (if any) remains, so no double-counting.
      importedCount: { increment: imported - flushedImported },
      skippedCount: { increment: skipped - flushedSkipped },
      errorCount: { increment: errors.length - flushedErrors },
      status: done ? 'COMPLETE' : 'PAUSED',
      completedAt: done ? new Date() : null,
    },
  })

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    errors: errors.slice(0, 10),
    // More pending work that this invocation can resume right now
    // (time budget hit). The client loops on this until it clears.
    hasMore: !done && !dailyCap,
    // Blocked until the daily cap resets tomorrow.
    dailyCap: !done && dailyCap,
    paused: !done,
    timeBudgetHit: hitTimeBudget,
  })
}
