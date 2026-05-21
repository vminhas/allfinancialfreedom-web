import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import type { TeamSection } from '@/generated/prisma/client'

// Public team page editor.
// GET    list every team member grouped by section, ordered for render
// POST   add a new member to a section (image upload is a separate call)
//
// Per-id update / delete:  ./[id]/route.ts
// Photo upload:            ./[id]/photo/route.ts
// Drag-reorder:            ./reorder/route.ts

const SECTIONS: ReadonlySet<TeamSection> = new Set(['LEADERSHIP', 'DIRECTOR', 'ASSOCIATE'])

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const members = await db.teamMember.findMany({
    orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
  })
  return NextResponse.json({ members })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    section?: string; name?: string; title?: string; credentials?: string;
    specialty?: string; location?: string; initials?: string;
    imageUrl?: string; bio?: string; calendly?: string;
  }

  if (!body.section || !SECTIONS.has(body.section as TeamSection)) {
    return NextResponse.json({ error: 'valid section is required' }, { status: 400 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Append to the end of the section. Drag-reorder rewrites every
  // sortOrder in one transaction anyway, so we don't need anything
  // cleverer here.
  const last = await db.teamMember.findFirst({
    where: { section: body.section as TeamSection },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const member = await db.teamMember.create({
    data: {
      section: body.section as TeamSection,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      name: body.name.trim(),
      title: body.title?.trim() || null,
      credentials: body.credentials?.trim() || null,
      specialty: body.specialty?.trim() || null,
      location: body.location?.trim() || null,
      initials: body.initials?.trim() || null,
      imageUrl: body.imageUrl?.trim() || null,
      bio: body.bio?.trim() || null,
      calendly: body.calendly?.trim() || null,
    },
  })
  return NextResponse.json({ member })
}
