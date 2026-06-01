import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { mergeSubmissions } from '@/lib/submission-merge'

// POST /api/admin/new-business/merge
//   body: { keepId, mergeId, dryRun? }
//
// Merges the `merge` submission into the `keep` submission inside one
// transaction. Authoritative Tevah-sourced fields override on the
// keeper; child rows (notes, activity, renewal reminders, mutes) are
// re-pointed, with collision-safe handling for the unique-constrained
// children. With dryRun:true, returns the preview without writing.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { keepId?: string; mergeId?: string; dryRun?: boolean }
  if (!body.keepId || !body.mergeId) {
    return NextResponse.json({ error: 'keepId and mergeId required' }, { status: 400 })
  }
  if (body.keepId === body.mergeId) {
    return NextResponse.json({ error: 'keepId and mergeId must differ' }, { status: 400 })
  }

  try {
    const result = await mergeSubmissions({
      keepId: body.keepId,
      mergeId: body.mergeId,
      dryRun: !!body.dryRun,
    })
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
