import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import type { TeamSection } from '@/generated/prisma/client'

// Persist a new order for one section after a drag.
// Body: { section: TeamSection, ids: string[] (in display order) }
// Rewrites sortOrder in a single transaction so the row order is
// stable for the public page regardless of how callers index.

const SECTIONS: ReadonlySet<TeamSection> = new Set(['LEADERSHIP', 'DIRECTOR', 'ASSOCIATE'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { section?: string; ids?: string[] }
  if (!body.section || !SECTIONS.has(body.section as TeamSection)) {
    return NextResponse.json({ error: 'valid section is required' }, { status: 400 })
  }
  if (!Array.isArray(body.ids) || body.ids.some(x => typeof x !== 'string')) {
    return NextResponse.json({ error: 'ids must be an array of strings' }, { status: 400 })
  }

  await db.$transaction(
    body.ids.map((id, idx) =>
      db.teamMember.updateMany({
        where: { id, section: body.section as TeamSection },
        data: { sortOrder: idx },
      }),
    ),
  )
  return NextResponse.json({ ok: true })
}
