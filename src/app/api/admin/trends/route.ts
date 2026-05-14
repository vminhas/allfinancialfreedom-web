import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/trends?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&granularity=day|week|month
// Returns new-agent counts bucketed by ICA date (falls back to createdAt for agents without one).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const startDate   = searchParams.get('startDate')
  const endDate     = searchParams.get('endDate')
  const granularity = (searchParams.get('granularity') ?? 'month') as 'day' | 'week' | 'month'

  const startDt = startDate ? new Date(startDate)                     : null
  const endDt   = endDate   ? new Date(endDate + 'T23:59:59')         : null

  // Include agents whose icaDate falls in range, OR whose icaDate is null and createdAt falls in range.
  const profiles = await db.agentProfile.findMany({
    where: {
      isTest: false,
      OR: [
        {
          icaDate: {
            not: null,
            ...(startDt ? { gte: startDt } : {}),
            ...(endDt   ? { lte: endDt   } : {}),
          },
        },
        {
          icaDate: null,
          createdAt: {
            ...(startDt ? { gte: startDt } : {}),
            ...(endDt   ? { lte: endDt   } : {}),
          },
        },
      ],
    },
    select: { icaDate: true, createdAt: true, status: true },
  })

  // Helpers for bucketing
  const getKey = (d: Date): string => {
    if (granularity === 'day') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    if (granularity === 'week') {
      const mon = new Date(d)
      const dow = mon.getDay()
      mon.setDate(mon.getDate() - (dow === 0 ? 6 : dow - 1))
      return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const getLabel = (key: string): string => {
    if (granularity === 'day') {
      const [y, m, d] = key.split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    if (granularity === 'week') {
      const [y, m, d] = key.split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    const [y, m] = key.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }

  // Bucket profiles
  const buckets: Record<string, { newAgents: number; active: number }> = {}
  for (const p of profiles) {
    const date = p.icaDate ?? p.createdAt
    if (!date) continue
    const key = getKey(date)
    if (!buckets[key]) buckets[key] = { newAgents: 0, active: 0 }
    buckets[key].newAgents++
    if (p.status === 'ACTIVE') buckets[key].active++
  }

  // Fill gaps between first and last data point (or between startDate/endDate for day granularity)
  const months: { month: string; label: string; newAgents: number; active: number }[] = []
  const keys = Object.keys(buckets).sort()

  if (keys.length > 0) {
    if (granularity === 'day') {
      // Walk day by day from start to end
      const first = startDt ? new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate())
                            : (() => { const [y,m,d] = keys[0].split('-').map(Number); return new Date(y,m-1,d) })()
      const last  = endDt   ? new Date(endDt.getFullYear(),   endDt.getMonth(),   endDt.getDate())
                            : (() => { const [y,m,d] = keys[keys.length-1].split('-').map(Number); return new Date(y,m-1,d) })()
      const cur = new Date(first)
      while (cur <= last) {
        const key = getKey(cur)
        months.push({ month: key, label: getLabel(key), newAgents: buckets[key]?.newAgents ?? 0, active: buckets[key]?.active ?? 0 })
        cur.setDate(cur.getDate() + 1)
      }
    } else if (granularity === 'week') {
      const [fy, fm, fd] = keys[0].split('-').map(Number)
      const [ly, lm, ld] = keys[keys.length - 1].split('-').map(Number)
      const cur = new Date(fy, fm - 1, fd)
      const last = new Date(ly, lm - 1, ld)
      while (cur <= last) {
        const key = getKey(cur)
        months.push({ month: key, label: getLabel(key), newAgents: buckets[key]?.newAgents ?? 0, active: buckets[key]?.active ?? 0 })
        cur.setDate(cur.getDate() + 7)
      }
    } else {
      // Monthly: walk month by month
      const [sy, sm] = keys[0].split('-').map(Number)
      const [ey, em] = keys[keys.length - 1].split('-').map(Number)
      let y = sy, m = sm
      while (y < ey || (y === ey && m <= em)) {
        const key = `${y}-${String(m).padStart(2, '0')}`
        months.push({ month: key, label: getLabel(key), newAgents: buckets[key]?.newAgents ?? 0, active: buckets[key]?.active ?? 0 })
        m++
        if (m > 12) { m = 1; y++ }
      }
    }
  }

  return NextResponse.json({ months, granularity })
}
