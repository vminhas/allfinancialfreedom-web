import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// PATCH /api/admin/climb/articles/[id]
//
// Used to edit the title/body and to flip status to PUBLISHED or
// REJECTED. When publishing, fire a Discord DM to the agent letting
// them know their article is live; the milestone callout already
// happened when they crossed the threshold.

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.agentArticle.findUnique({
    where: { id },
    include: {
      agentProfile: { select: { discordUserId: true, firstName: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    title?: string
    body?: string
    status?: 'DRAFT' | 'PUBLISHED' | 'REJECTED'
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.body !== undefined) data.body = body.body
  const validStatuses = new Set(['DRAFT', 'PUBLISHED', 'REJECTED'])
  if (body.status !== undefined && validStatuses.has(body.status)) {
    data.status = body.status
    data.reviewedById = adminId
    data.reviewedAt = new Date()
    if (body.status === 'PUBLISHED' && !existing.publishedAt) {
      data.publishedAt = new Date()
    }
  }

  const updated = await db.agentArticle.update({ where: { id }, data })

  // Notify the agent on transition into PUBLISHED.
  if (
    body.status === 'PUBLISHED' &&
    existing.status !== 'PUBLISHED' &&
    existing.agentProfile.discordUserId &&
    process.env.DISCORD_BOT_TOKEN
  ) {
    notifyAgentArticlePublished(
      existing.agentProfile.discordUserId,
      existing.agentProfile.firstName,
      updated.title,
    ).catch(() => {})
  }

  return NextResponse.json({ article: updated })
}

async function notifyAgentArticlePublished(discordUserId: string, firstName: string, title: string) {
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: discordUserId }),
  })
  if (!dmRes.ok) return
  const dm = await dmRes.json() as { id: string }
  const { sendChannelMessage } = await import('@/lib/discord')
  await sendChannelMessage(dm.id, {
    embeds: [{
      title: `${firstName}, your article is live`,
      description: `**${title}** is now showing on your Climb tab. Have a read.`,
      color: 0xC9A96E,
      footer: { text: 'All Financial Freedom' },
    }],
  })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  await db.agentArticle.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
