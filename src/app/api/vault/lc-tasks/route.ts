import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { ensureLcTasksSeeded, etDayKey } from '@/lib/lc-tasks'

// GET  /api/vault/lc-tasks   active task list + today's key
// POST /api/vault/lc-tasks   add an ad-hoc task { title }
//
// Active list = all recurring tasks (the SOP steps, which reset each
// day) + ad-hoc tasks that are not completed OR were completed today.
// Ad-hoc tasks finished on a prior day drop off so the panel stays
// tidy; they remain in the DB for past-day digests.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  await ensureLcTasksSeeded()
  const today = etDayKey()

  const tasks = await db.lcTask.findMany({
    where: {
      OR: [
        { recurring: true },
        { completedOn: null },
        { completedOn: today },
      ],
    },
    orderBy: [{ recurring: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ tasks, today })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as { title?: string; recurring?: boolean }
  const title = (body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  // New ad-hoc tasks sort after everything; new recurring tasks (if the
  // admin ever adds an SOP step) sort to the end of the recurring group.
  const last = await db.lcTask.findFirst({
    where: { recurring: !!body.recurring },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const task = await db.lcTask.create({
    data: {
      title,
      recurring: !!body.recurring,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
  return NextResponse.json({ task })
}
