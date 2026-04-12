import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() as { ids: string[] }
  if (!ids || ids.length === 0) return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })

  // Delete messages first (FK constraint)
  await db.outreachMessage.deleteMany({ where: { contactId: { in: ids } } })
  const { count } = await db.contact.deleteMany({ where: { id: { in: ids } } })

  return NextResponse.json({ ok: true, deleted: count })
}
