import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST reject a draft. Kept (not deleted) so we can sample bad outputs
// later to tune the writer prompt. Reason is optional but encouraged.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { reason?: string }
  const article = await db.generatedArticle.update({
    where: { id },
    data: { status: 'REJECTED', rejectedReason: (body.reason ?? '').trim() || null, autoPublishAt: null },
  })
  return NextResponse.json({ ok: true, article })
}
