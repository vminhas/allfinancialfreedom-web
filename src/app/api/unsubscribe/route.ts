import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  await db.suppressionEntry.upsert({
    where: { email: email.toLowerCase() },
    update: { reason: 'unsubscribed' },
    create: { email: email.toLowerCase(), reason: 'unsubscribed' },
  })

  // Also mark contact as opted out
  await db.contact.updateMany({
    where: { email: email.toLowerCase() },
    data: { outreachStatus: 'opted-out' },
  })

  return NextResponse.json({ ok: true })
}
