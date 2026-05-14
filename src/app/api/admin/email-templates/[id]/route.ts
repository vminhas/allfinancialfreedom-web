import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'

// PATCH / DELETE for an individual template. Listing + creation live
// at /api/admin/email-templates/route.ts.

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json() as {
    label?: string; description?: string;
    eventType?: string; recipient?: 'CONTACT' | 'INTERNAL'; internalTo?: string;
    filterJson?: unknown; subject?: string; bodyHtml?: string;
    senderId?: string; enabled?: boolean
  }

  const template = await db.emailTemplate.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.eventType !== undefined && { eventType: body.eventType.trim() }),
      ...(body.recipient !== undefined && { recipient: body.recipient }),
      ...(body.internalTo !== undefined && { internalTo: body.internalTo?.trim() || null }),
      ...(body.filterJson !== undefined && { filterJson: (body.filterJson as object | null) ?? undefined }),
      ...(body.subject !== undefined && { subject: body.subject.trim() }),
      ...(body.bodyHtml !== undefined && { bodyHtml: body.bodyHtml }),
      ...(body.senderId !== undefined && { senderId: body.senderId }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
    },
    include: { sender: true },
  })
  return NextResponse.json({ template })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  await db.emailTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
