import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { ensureEmailTemplateSeed } from '@/lib/email-template-seed'

// Admin CRUD for EmailSender rows. The "from" identities the GHL
// webhook templates can send under. Admin-only because changing a
// sender's email address changes which mailbox actually delivers
// production emails to leads + agents.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  await ensureEmailTemplateSeed()

  const senders = await db.emailSender.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json({ senders })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    key?: string; name?: string; email?: string; role?: string;
    isDefault?: boolean; enabled?: boolean
  }
  if (!body.key || !body.name || !body.email) {
    return NextResponse.json({ error: 'key, name, email required' }, { status: 400 })
  }

  const sender = await db.emailSender.create({
    data: {
      key: body.key.trim().toLowerCase(),
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      role: body.role?.trim() || null,
      isDefault: !!body.isDefault,
      enabled: body.enabled ?? true,
    },
  })
  return NextResponse.json({ sender })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    name?: string; email?: string; role?: string;
    isDefault?: boolean; enabled?: boolean
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sender = await db.emailSender.update({
    where: { id: body.id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.email !== undefined && { email: body.email.trim().toLowerCase() }),
      ...(body.role !== undefined && { role: body.role?.trim() || null }),
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
    },
  })
  return NextResponse.json({ sender })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Guard: senders with templates can't be deleted (FK restrict). The
  // admin should reassign templates to another sender first.
  const inUse = await db.emailTemplate.count({ where: { senderId: id } })
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Sender is used by ${inUse} template(s). Reassign them before deleting.` },
      { status: 409 },
    )
  }

  await db.emailSender.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
