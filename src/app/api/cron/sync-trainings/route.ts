import { NextRequest, NextResponse } from 'next/server'
import { syncTrainingsFromDrive } from '@/lib/training-sync'
import { trainingAutomationEnabled } from '@/lib/training-automation'

// GET /api/cron/sync-trainings — protected by CRON_SECRET, runs hourly
// Optional ?force=true bypasses the modifiedTime check and re-parses every file
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Training moved to Cadre: stop the Drive auto-parse.
  if (!(await trainingAutomationEnabled())) {
    return NextResponse.json({ skipped: 'training automation disabled (handled by Cadre)' })
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
