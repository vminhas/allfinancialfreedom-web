import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { ensureEmailTemplateSeed } from '@/lib/email-template-seed'

// List + create email templates. Per-row update / delete / test-send
// live in ./[id]/route.ts and ./[id]/test-send/route.ts.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  await ensureEmailTemplateSeed()

  const templates = await db.emailTemplate.findMany({
    include: { sender: { select: { id: true, key: true, name: true, email: true, role: true } } },
    orderBy: [{ eventType: 'asc' }, { label: 'asc' }],
  })
  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    key?: string; label?: string; description?: string;
    eventType?: string; recipient?: 'CONTACT' | 'INTERNAL'; internalTo?: string;
    filterJson?: unknown; subject?: string; bodyHtml?: string;
    senderId?: string; enabled?: boolean
  }
  if (!body.key || !body.label || !body.eventType || !body.subject || !body.bodyHtml || !body.senderId) {
    return NextResponse.json(
      { error: 'key, label, eventType, subject, bodyHtml, senderId required' },
      { status: 400 },
    )
  }

  const template = await db.emailTemplate.create({
    data: {
      key: body.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      label: body.label.trim(),
      description: body.description?.trim() || null,
      eventType: body.eventType.trim(),
      recipient: body.recipient ?? 'CONTACT',
      internalTo: body.internalTo?.trim() || null,
      filterJson: (body.filterJson as object | null) ?? undefined,
      subject: body.subject.trim(),
      bodyHtml: body.bodyHtml,
      senderId: body.senderId,
      enabled: body.enabled ?? true,
    },
    include: { sender: true },
  })
  return NextResponse.json({ template })
}
