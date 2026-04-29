// Two-phase contact-import endpoint:
//
//   POST { mode: 'preview', csv: string }   → parse the CSV and return a
//     normalized list of rows with a suggested category. The agent
//     classifies each row in the UI. Nothing is written.
//
//   POST { mode: 'commit',  rows: ImportRow[] } → bulk-insert the
//     classified rows as BusinessPartner records owned by the calling
//     agent. Returns the inserted records so the UI can drop them into
//     the existing list without a refetch.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseCsv } from '@/lib/csv-parse'
import { extractContactRow } from '@/lib/contact-csv'
import { resolveAgentIdentity } from '@/lib/agent-identity'

const ALLOWED_CATEGORIES = new Set([
  'business_partner', 'life_market', 'rollover_market', 'fta_contact', 'recruit',
])

interface ImportRow {
  name: string
  email?: string | null
  phone?: string | null
  occupation?: string | null
  notes?: string | null
  category?: string | null
}

export async function POST(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error
  const profileId = id.profileId

  const body = await req.json() as
    | { mode: 'preview'; csv: string }
    | { mode: 'commit'; rows: ImportRow[] }

  if (body.mode === 'preview') {
    if (typeof body.csv !== 'string' || body.csv.length === 0) {
      return NextResponse.json({ error: 'csv body required' }, { status: 400 })
    }
    if (body.csv.length > 2_000_000) {
      return NextResponse.json({ error: 'CSV too large (2MB max)' }, { status: 413 })
    }

    const parsed = parseCsv(body.csv)
    if (parsed.length < 2) {
      return NextResponse.json({ error: 'CSV must include a header row and at least one data row' }, { status: 400 })
    }

    const headers = parsed[0]
    const dataRows = parsed.slice(1)

    const rows = dataRows
      .map(r => extractContactRow(headers, r))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 500)  // cap one import at 500 to keep UX manageable

    return NextResponse.json({ rows, total: rows.length })
  }

  if (body.mode === 'commit') {
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: 'rows required' }, { status: 400 })
    }
    if (body.rows.length > 500) {
      return NextResponse.json({ error: 'Too many rows (500 max per import)' }, { status: 413 })
    }

    const valid = body.rows.filter(r => typeof r.name === 'string' && r.name.trim().length > 0)
    if (valid.length === 0) {
      return NextResponse.json({ error: 'No rows with a name' }, { status: 400 })
    }

    // createMany is the single fastest path for bulk insert. We don't need
    // the inserted records to come back from the DB — the UI already has
    // the list with category overrides applied, so we can echo it.
    await db.businessPartner.createMany({
      data: valid.map(r => ({
        agentProfileId: profileId,
        name: r.name.trim(),
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        occupation: r.occupation?.trim() || null,
        notes: r.notes?.trim() || null,
        category: r.category && ALLOWED_CATEGORIES.has(r.category) ? r.category : null,
        source: 'csv_import',
      })),
    })

    // Return the freshly-inserted rows so the UI can update without a
    // separate GET. We refetch by source+createdAt rather than ids since
    // createMany doesn't return them in Prisma.
    const inserted = await db.businessPartner.findMany({
      where: { agentProfileId: profileId, source: 'csv_import' },
      orderBy: { createdAt: 'desc' },
      take: valid.length,
    })

    return NextResponse.json({ inserted: inserted.length, partners: inserted })
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
}
