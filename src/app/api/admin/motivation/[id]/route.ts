import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'

// PATCH / DELETE for a single library line. Listing + creation live at
// /api/admin/motivation/route.ts.

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json() as { text?: string; active?: boolean; voice?: string; attribution?: string | null }

  if (body.text !== undefined) {
    const trimmed = body.text.trim()
    if (!trimmed) return NextResponse.json({ error: 'text cannot be empty' }, { status: 400 })
    if (trimmed.includes('—')) {
      return NextResponse.json({ error: 'No em-dashes allowed in posted copy.' }, { status: 400 })
    }
  }
  if (typeof body.attribution === 'string' && body.attribution.includes('—')) {
    return NextResponse.json({ error: 'No em-dashes allowed in posted copy.' }, { status: 400 })
  }

  const quote = await db.motivationQuote.update({
    where: { id },
    data: {
      ...(body.text !== undefined && { text: body.text.trim() }),
      ...(typeof body.active === 'boolean' && { active: body.active }),
      ...(body.voice !== undefined && { voice: body.voice.trim() || 'classic' }),
      // null or '' clears the credit; a string sets it.
      ...(body.attribution !== undefined && { attribution: (body.attribution?.trim() || null) }),
    },
    select: { id: true, text: true, voice: true, attribution: true, active: true, sortKey: true },
  })

  return NextResponse.json({ quote })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  await db.motivationQuote.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
