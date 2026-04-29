// Diagnostic endpoint for import jobs. Use this when the job's
// importedCount + skippedCount don't add up to totalRows — it surfaces
// what's actually in the contacts table so you can see where rows went.
//
// Returns the gap (unaccounted rows), and lets you reset orphans back
// into the queue with ?action=requeue (POST).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { jobId } = await ctx.params

  const job = await db.importJob.findUnique({ where: { id: jobId } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Total contacts attached to this job
  const totalContacts = await db.contact.count({ where: { importJobId: jobId } })

  // Breakdowns by ghl-contact state and outreach status
  const [withGhl, withoutGhl] = await Promise.all([
    db.contact.count({ where: { importJobId: jobId, ghlContactId: { not: null } } }),
    db.contact.count({ where: { importJobId: jobId, ghlContactId: null } }),
  ])

  const statusCountsRaw = await db.contact.groupBy({
    by: ['outreachStatus'],
    where: { importJobId: jobId },
    _count: { _all: true },
  })
  const statusCounts: Record<string, number> = {}
  for (const r of statusCountsRaw) {
    statusCounts[r.outreachStatus ?? '(null)'] = r._count._all
  }

  // Orphans = rows in the DB that the importer should still process but
  // can't reach because of the skip/filter bug. They're "untouched" — no
  // ghlContactId AND no outreachStatus stamped (a 409 would have left
  // outreachStatus='duplicate', a successful send leaves 'pending'/'sent').
  const orphans = await db.contact.count({
    where: {
      importJobId: jobId,
      ghlContactId: null,
      OR: [{ outreachStatus: null }, { outreachStatus: '' }],
    },
  })

  // Stuck duplicates — flagged 'duplicate' but no ghlContactId, so they
  // re-enter the pending queue every run and burn cap.
  const stuckDuplicates = await db.contact.count({
    where: { importJobId: jobId, ghlContactId: null, outreachStatus: 'duplicate' },
  })

  return NextResponse.json({
    job: {
      id: job.id,
      fileName: job.fileName,
      status: job.status,
      totalRows: job.totalRows,
      importedCount: job.importedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      lastRowIndex: job.lastRowIndex,
    },
    actuals: {
      contactsCreated: totalContacts,
      withGhlContactId: withGhl,
      withoutGhlContactId: withoutGhl,
      orphansNeverAttempted: orphans,
      stuckDuplicates,
      statusBreakdown: statusCounts,
    },
    gap: {
      // What the job *thinks* happened vs what the DB actually shows
      reportedAccountedFor: job.importedCount + job.skippedCount,
      missingFromCounters: Math.max(0, job.totalRows - (job.importedCount + job.skippedCount)),
      // Of the rows that physically exist in `contacts`, how many never got tried
      neverProcessed: orphans + stuckDuplicates,
    },
  })
}

// POST — requeue orphans by resetting outreachStatus and clearing
// the job's lastRowIndex. The fixed importer (no `skip`) will then
// pick them up. Optional ?action=clearStuckDuplicates to also clear
// the 'duplicate' flag so they get retried.
export async function POST(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { jobId } = await ctx.params
  const url = new URL(req.url)
  const clearStuck = url.searchParams.get('clearStuckDuplicates') === 'true'

  const job = await db.importJob.findUnique({ where: { id: jobId } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Reset progress pointer so the (fixed) importer treats every
  // not-yet-imported row as still pending.
  await db.importJob.update({
    where: { id: jobId },
    data: {
      lastRowIndex: 0,
      status: 'PAUSED',
      completedAt: null,
    },
  })

  let cleared = 0
  if (clearStuck) {
    const res = await db.contact.updateMany({
      where: { importJobId: jobId, ghlContactId: null, outreachStatus: 'duplicate' },
      data: { outreachStatus: null },
    })
    cleared = res.count
  }

  return NextResponse.json({ ok: true, lastRowIndexReset: true, stuckDuplicatesCleared: cleared })
}
