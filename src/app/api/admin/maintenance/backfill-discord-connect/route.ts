import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/maintenance/backfill-discord-connect
//
// One-shot maintenance: anyone who linked Discord before the
// connect_discord PhaseItem write was added to discord-callback (so,
// most existing AFF agents) has discordUserId set on their profile
// but the Phase-1 connect_discord checklist row missing or unchecked.
// The agent dashboard's self-heal already fixes them lazily on their
// next page load, but the leaderboard / progression matrix won't
// reflect them until each agent actually opens their portal.
//
// This endpoint scans every active agent with discordUserId set and
// upserts their PhaseItem in one pass, returning a count summary so
// the admin sees how many were already correct vs. just fixed.
//
// Idempotent — running it twice is a no-op (the upsert keeps
// completedAt on rows that were already completed).
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  // Pull every agent with Discord linked. Don't gate on status — even
  // INACTIVE agents who once connected should have their checklist
  // row reflect that, since the act of connecting actually happened.
  const profiles = await db.agentProfile.findMany({
    where: { discordUserId: { not: null }, isTest: false },
    select: { id: true },
  })

  let alreadyComplete = 0
  let fixed = 0
  const now = new Date()

  for (const p of profiles) {
    const existing = await db.phaseItem.findUnique({
      where: {
        agentProfileId_phase_itemKey: {
          agentProfileId: p.id,
          phase: 1,
          itemKey: 'connect_discord',
        },
      },
      select: { completed: true },
    })
    if (existing?.completed) {
      alreadyComplete++
      continue
    }
    await db.phaseItem.upsert({
      where: {
        agentProfileId_phase_itemKey: {
          agentProfileId: p.id,
          phase: 1,
          itemKey: 'connect_discord',
        },
      },
      update: { completed: true, completedAt: now },
      create: {
        agentProfileId: p.id,
        phase: 1,
        itemKey: 'connect_discord',
        completed: true,
        completedAt: now,
      },
    })
    fixed++
  }

  return NextResponse.json({
    ok: true,
    scanned: profiles.length,
    alreadyComplete,
    fixed,
  })
}
