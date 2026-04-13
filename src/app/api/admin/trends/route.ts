import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/trends?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns monthly new-agent counts bucketed by ICA date (contract start date).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')

  const where: Record<string, unknown> = { icaDate: { not: null } }
  if (startDate) (where.icaDate as Record<string, unknown>).gte = new Date(startDate)
  if (endDate)   (where.icaDate as Record<string, unknown>).lte = new Date(endDate + 'T23:59:59')

  const profiles = await db.agentProfile.findMany({
    where,
    select: { icaDate: true, status: true },
    orderBy: { icaDate: 'asc' },
  })

  // Bucket by YYYY-MM
  const buckets: Record<string, { newAgents: number; active: number }> = {}
  for (const p of profiles) {
    if (!p.icaDate) continue
    const key = `${p.icaDate.getFullYear()}-${String(p.icaDate.getMonth() + 1).padStart(2, '0')}`
    if (!buckets[key]) buckets[key] = { newAgents: 0, active: 0 }
    buckets[key].newAgents++
    if (p.status === 'ACTIVE') buckets[key].active++
  }

  // Fill in any empty months between start and end so the chart has no gaps
  const months: { month: string; label: string; newAgents: number; active: number }[] = []
  const keys = Object.keys(buckets).sort()
  if (keys.length > 0) {
    const [startY, startM] = keys[0].split('-').map(Number)
    const [endY, endM]     = keys[keys.length - 1].split('-').map(Number)
    let y = startY, m = startM
    while (y < endY || (y === endY && m <= endM)) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      const date = new Date(y, m - 1, 1)
      months.push({
        month: key,
        label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        newAgents: buckets[key]?.newAgents ?? 0,
        active:    buckets[key]?.active    ?? 0,
      })
      m++
      if (m > 12) { m = 1; y++ }
    }
  }

  return NextResponse.json({ months })
}
