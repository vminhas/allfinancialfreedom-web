import { NextRequest, NextResponse } from 'next/server'
import { rollForwardRecurringTrainings } from '@/lib/training-recurrence'
import { trainingAutomationEnabled } from '@/lib/training-automation'

// GET /api/cron/roll-recurring-trainings
// Runs daily. Tops up every ongoing (auto-extending) recurring training
// series so it always has a full rolling window of future occurrences
// scheduled, each with its own Discord scheduled event. Idempotent: only
// adds when a series has dropped below its low-water mark.
//
// Required env: CRON_SECRET
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Training moved to Cadre: stop topping up recurring series.
  if (!(await trainingAutomationEnabled())) {
    return NextResponse.json({ skipped: 'training automation disabled (handled by Cadre)' })
  }

  try {
    const result = await rollForwardRecurringTrainings()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[roll-recurring-trainings] failed:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
