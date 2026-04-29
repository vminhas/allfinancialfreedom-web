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

// Three-bucket model. life_market / rollover_market were retired in
// favor of the simpler intent-based set (recruit, business_partner,
// fta_contact). Old data is migrated by the
// 20260430010000_partner_categories_consolidate migration.
const ALLOWED_CATEGORIES = new Set([
  'recruit', 'business_partner', 'fta_contact',
])

interface ImportRow {
  name: string
  email?: string | null
  phone?: string | null
  occupation?: string | null
  organization?: string | null
  birthday?: string | null
  city?: string | null
  state?: string | null
  notes?: string | null
  category?: string | null  // optional: if set, contact leaves the queue immediately
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

    // Compose notes from any extra context the parser found that doesn't
    // fit a dedicated column (organization, birthday, city, state). The
    // agent can edit these later, but having them visible on the row is
    // far better than dropping the data on the floor.
    const composeNotes = (r: ImportRow): string | null => {
      const bits = [
        r.notes,
        r.organization && r.organization !== r.occupation ? `Org: ${r.organization}` : null,
        r.birthday ? `Bday: ${r.birthday}` : null,
        r.city && r.state ? `${r.city}, ${r.state}` : (r.city || r.state),
      ].filter((b): b is string => !!b && b.trim().length > 0)
      return bits.length > 0 ? bits.join(' · ') : null
    }

    // Imports go straight into the queue (status PENDING). If the agent
    // pre-classified some rows during preview, those skip the queue and
    // land in their lane as NEW.
    await db.businessPartner.createMany({
      data: valid.map(r => {
        const cat = r.category && ALLOWED_CATEGORIES.has(r.category) ? r.category : null
        return {
          agentProfileId: profileId,
          name: r.name.trim(),
          email: r.email?.trim() || null,
          phone: r.phone?.trim() || null,
          occupation: r.occupation?.trim() || null,
          notes: composeNotes(r),
          category: cat,
          status: cat ? 'NEW' : 'PENDING',
          source: 'csv_import',
        }
      }),
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
