import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

// PATCH /api/admin/call-scripts/[id] — update a script's name, content,
// resource URL, or active flag. Activating a script auto-deactivates
// any other active script for the same callType.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.callScript.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    name?: string
    content?: string
    resourceUrl?: string | null
    active?: boolean
  }

  const updated = await db.$transaction(async tx => {
    if (body.active === true && !existing.active) {
      await tx.callScript.updateMany({
        where: { callType: existing.callType, active: true, NOT: { id } },
        data: { active: false },
      })
    }
    return tx.callScript.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.resourceUrl !== undefined
          ? { resourceUrl: body.resourceUrl?.trim() || null }
          : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    })
  })
  return NextResponse.json({ script: updated })
}

// DELETE /api/admin/call-scripts/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.callScript.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.callScript.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
