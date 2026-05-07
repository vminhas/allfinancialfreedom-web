import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { getBookingLinks, saveBookingLinks, type BookingLink, BOOKING_GROUP_ORDER } from '@/lib/booking-links'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const links = await getBookingLinks()
  return NextResponse.json({ links })
}

// PUT replaces the whole list. The vault settings UI sends back the
// edited array verbatim so we don't need partial-update semantics.
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { links?: unknown }
  if (!Array.isArray(body.links)) {
    return NextResponse.json({ error: 'links must be an array' }, { status: 400 })
  }

  // Sanitize: keep known fields, drop anything weird, enforce non-empty
  // name + calendlyUrl. Group falls back to 'trainers' if missing.
  const cleaned: BookingLink[] = []
  for (const raw of body.links) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const url = typeof r.calendlyUrl === 'string' ? r.calendlyUrl.trim() : ''
    if (!name || !url) continue
    const group = BOOKING_GROUP_ORDER.includes(r.group as never)
      ? (r.group as BookingLink['group'])
      : 'trainers'
    cleaned.push({
      id: typeof r.id === 'string' && r.id ? r.id : `bl_${Math.random().toString(36).slice(2, 12)}`,
      name,
      role: typeof r.role === 'string' ? r.role.trim() : '',
      group,
      calendlyUrl: url,
      description: typeof r.description === 'string' ? r.description.trim() || undefined : undefined,
      icon: typeof r.icon === 'string' ? r.icon.trim() || undefined : undefined,
      avatarUrl: typeof r.avatarUrl === 'string' ? r.avatarUrl.trim() || undefined : undefined,
      personType: r.personType === 'admin' || r.personType === 'agent' ? r.personType : undefined,
      personId: typeof r.personId === 'string' ? r.personId.trim() || undefined : undefined,
    })
  }

  await saveBookingLinks(cleaned)
  return NextResponse.json({ links: cleaned })
}
