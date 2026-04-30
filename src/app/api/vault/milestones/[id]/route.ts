import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// DELETE /api/vault/milestones/[id]
//
// Revokes (deletes) a previously-awarded milestone row. Used when an
// admin realizes the agent was awarded by mistake or no longer meets
// the criteria. We delete the row outright instead of soft-revoking
// because re-awarding a fresh row gives the agent a clean slate
// (re-celebration in Discord, fresh `completedAt`) which is the
// intent if the LC ever brings them back.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const existing = await db.recognitionMilestone.findUnique({
    where: { id }, select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })

  await db.recognitionMilestone.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
