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
    distinct: ['cft'],
    orderBy: { cft: 'asc' },
  })

  const trainers = rows.map(r => r.cft!).filter(Boolean)
  return NextResponse.json({ trainers })
}
