import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.agentProfile.findMany({
    select: { cft: true },
    where: { cft: { not: null } },
    orderBy: { cft: 'asc' },
  })

  // Deduplicate case-insensitively, keeping the first occurrence (already sorted)
  const seen = new Set<string>()
  const trainers: string[] = []
  for (const r of rows) {
    const name = r.cft?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      trainers.push(name)
    }
  }

  return NextResponse.json({ trainers })
}
