import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { getOnboardingLaggards, postOnboardingDigest } from '@/lib/onboarding-watch'

// GET  /api/admin/onboarding-watch  → live laggard list for the tracker
// POST /api/admin/onboarding-watch  → run the report now and post the
//                                     digest to the admin activity channel
//
// Same logic the daily cron uses, so the on-demand report and the
// automated one never disagree.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const laggards = await getOnboardingLaggards()
  return NextResponse.json({ laggards, count: laggards.length })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const laggards = await getOnboardingLaggards()
  const { posted } = await postOnboardingDigest(laggards)
  return NextResponse.json({ laggards, count: laggards.length, posted })
}
