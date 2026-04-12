import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

const KEY = 'SAVED_EMAIL_TEMPLATES'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await db.setting.findUnique({ where: { key: KEY } })
  const templates = row ? JSON.parse(row.value) : []
  return NextResponse.json({ templates })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { templates } = await req.json()
  await db.setting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(templates) },
    create: { key: KEY, value: JSON.stringify(templates) },
  })
  return NextResponse.json({ ok: true })
}
