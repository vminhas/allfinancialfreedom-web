import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET    return one article (full body for editing)
// PATCH  edit title / excerpt / category / tags / mdxBody / coverImage
// DELETE remove a draft entirely (use sparingly; REJECT is preferred for prompt-tuning)

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const { id } = await ctx.params
  const article = await db.generatedArticle.findUnique({ where: { id } })
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ article })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const { id } = await ctx.params

  const body = await req.json() as {
    title?: string; excerpt?: string; category?: string; tags?: string[];
    mdxBody?: string; coverImage?: string;
  }
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.excerpt !== undefined) data.excerpt = body.excerpt.trim()
  if (body.category !== undefined) data.category = body.category.trim()
  if (Array.isArray(body.tags)) data.tags = body.tags.map(t => String(t).trim()).filter(Boolean)
  if (body.mdxBody !== undefined) data.mdxBody = body.mdxBody
  if (body.coverImage !== undefined) data.coverImage = body.coverImage.trim()

  // CLAUDE.md safety net: strip em-dashes from any user-visible string.
  for (const k of ['title', 'excerpt', 'mdxBody'] as const) {
    if (typeof data[k] === 'string') data[k] = (data[k] as string).replace(/—/g, ',').replace(/–/g, '-')
  }

  const article = await db.generatedArticle.update({ where: { id }, data })
  return NextResponse.json({ article })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const { id } = await ctx.params
  await db.generatedArticle.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
