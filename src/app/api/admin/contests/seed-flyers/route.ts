import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { seedFlyerContests } from '@/lib/seed-flyer-contests'

// POST /api/admin/contests/seed-flyers
// One-click setup for the All Out August (2 tiers) and Summer Sizzler
// (2 divisions) contests. Idempotent — safe to click more than once.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await seedFlyerContests()
  return NextResponse.json({ ok: true, ...result })
}
