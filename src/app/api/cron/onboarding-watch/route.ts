import { NextRequest, NextResponse } from 'next/server'
import { getOnboardingLaggards, postOnboardingDigest } from '@/lib/onboarding-watch'

// GET /api/cron/onboarding-watch
//
// Daily check (Vercel cron) for agents who are past their first week
// but still haven't joined Discord and/or completed onboarding
// training. Posts a digest to the admin activity channel. Empty days
// are skipped so we don't spam the channel when everyone's on track.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const laggards = await getOnboardingLaggards()
  const { posted } = await postOnboardingDigest(laggards)

  return NextResponse.json({ laggards: laggards.length, posted })
}
