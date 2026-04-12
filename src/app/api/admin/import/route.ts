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

  // Get contacts pending import for this job
  const pending = await db.contact.findMany({
    where: { importJobId: jobId, ghlContactId: null },
    skip: job.lastRowIndex,
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
          // 409 = duplicate, treat as skip
          if (contactRes.status === 409) {
            await db.contact.update({ where: { id: contact.id }, data: { outreachStatus: 'duplicate' } })
            skipped++
            return
          }
          errors.push(`${contact.email}: ${errText}`)
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

    // Update job progress
    await db.importJob.update({
      where: { id: jobId },
      data: {
        importedCount: { increment: batch.filter((_, bi) => {
          const batchStart = i
          return bi < Math.min(BATCH_SIZE, toProcess.length - batchStart)
        }).length },
        lastRowIndex: { increment: batch.length },
      },
    })

    if (i + BATCH_SIZE < toProcess.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // Update job counters accurately
  await db.importJob.update({
    where: { id: jobId },
    data: {
      importedCount: job.importedCount + imported,
      skippedCount: job.skippedCount + skipped,
      errorCount: job.errorCount + errors.length,
      lastRowIndex: job.lastRowIndex + toProcess.length,
      status: job.lastRowIndex + toProcess.length >= job.totalRows ? 'COMPLETE' : 'PAUSED',
      completedAt: job.lastRowIndex + toProcess.length >= job.totalRows ? new Date() : null,
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
