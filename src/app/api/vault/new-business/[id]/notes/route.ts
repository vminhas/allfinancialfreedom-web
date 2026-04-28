import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const adminId = (session!.user as { id: string }).id

  const submission = await db.newBusinessSubmission.findUnique({ where: { id }, select: { id: true } })
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { body?: string }
  const text = (body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  const note = await db.newBusinessNote.create({
    data: {
      submissionId: id,
      body: text,
      authorType: 'ADMIN',
      authorAdminId: adminId,
    },
    include: { authorAdmin: { select: { name: true } } },
  })
  return NextResponse.json({ note })
}
