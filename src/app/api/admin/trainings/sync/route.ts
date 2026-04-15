import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncTrainingsFromDrive } from '@/lib/training-sync'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/sync — admin-triggered manual sync
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const force = new URL(req.url).searchParams.get('force') === 'true'

  try {
    const stats = await syncTrainingsFromDrive({ force })
    return NextResponse.json(stats)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
