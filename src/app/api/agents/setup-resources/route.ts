import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resources = await db.setupResource.findMany({
    select: { key: true, url: true },
  })

  const map: Record<string, string> = {}
  for (const r of resources) {
    map[r.key] = r.url
  }

  return NextResponse.json({ resources: map })
}
