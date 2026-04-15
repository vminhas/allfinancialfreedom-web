import { NextRequest, NextResponse } from 'next/server'
import { syncTrainingsFromDrive } from '@/lib/training-sync'

// GET /api/cron/sync-trainings — protected by CRON_SECRET, runs hourly
// Optional ?force=true bypasses the modifiedTime check and re-parses every file
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
