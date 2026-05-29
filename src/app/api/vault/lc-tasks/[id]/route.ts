import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { etDayKey } from '@/lib/lc-tasks'

// PATCH  toggle done ({ done }) or rename ({ title })
// DELETE remove a task
//
// "done" maps to completedOn: checking sets it to today's ET day key,
// unchecking clears it. Recurring tasks use the same field so they
// auto-reset when the calendar day rolls over.

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json() as { done?: boolean; title?: string }

  const data: { completedOn?: string | null; title?: string } = {}
  if (body.done !== undefined) data.completedOn = body.done ? etDayKey() : null
  if (body.title !== undefined) {
    const t = body.title.trim()
    if (!t) return NextResponse.json({ error: 'title cannot be blank' }, { status: 400 })
    data.title = t
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const task = await db.lcTask.update({ where: { id }, data })
  return NextResponse.json({ task })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  await db.lcTask.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
