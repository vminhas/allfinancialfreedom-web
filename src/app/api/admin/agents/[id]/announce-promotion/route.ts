import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { buildAchievementEmbed, PHASE_ACCENT } from '@/lib/discord-card'
import { resolveAgentTitleById } from '@/lib/agent-title'

// POST /api/admin/agents/[id]/announce-promotion
//
// Re-fires the PROMOTION achievement card for an agent at their
// current phase. Used to backfill promotions that landed as plain
// text under the old code path (anything promoted before the card
// family shipped, e.g. Heather Cullum → Phase 3). Idempotent from
// the agent's perspective — no DB writes, just a fresh Discord post.
//
// Admin-only because the announcements channel is public and we
// don't want anyone other than admins triggering arbitrary
// re-announcements of stale phase events.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const agent = await db.agentProfile.findUnique({
    where: { id },
    select: {
      firstName: true, lastName: true, preferredName: true, agentCode: true, avatarUrl: true,
      phase: true, discordUserId: true,
    },
  })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  const phaseGoals: Record<number, string> = {
    2: 'Complete 10 Field Training Appointments and help your first 3 clients.',
    3: 'Get all sign-offs and master the core product suite.',
    4: 'Hit 45,000 points and build a team of 5 licensed agents.',
    5: 'Reach 150,000 net points in 6 months and develop a Marketing Director.',
  }

  const accent = PHASE_ACCENT[agent.phase] ?? 0xC9A96E
  // Title now comes from the rank resolver (driven by completed
  // promotion items), not from the phase number. The /announce-promotion
  // route re-broadcasts an agent's CURRENT title, so an agent stuck on
  // Phase 4 with no md_promotion box ticked re-announces as "Associate"
  // not "Senior Associate" — matches what the team page shows.
  const newTitle = await resolveAgentTitleById(id)

  const card = buildAchievementEmbed({
    flavor: 'PROMOTION',
    protagonist: {
      firstName: agent.firstName,
      lastName: agent.lastName,
      preferredName: agent.preferredName,
      agentCode: agent.agentCode,
      avatarUrl: agent.avatarUrl,
    },
    subline: `Promoted to **${newTitle}**`,
    fields: [
      { name: 'New phase', value: newTitle, inline: true },
      { name: 'Agent',     value: '`' + agent.agentCode + '`', inline: true },
      ...(phaseGoals[agent.phase] ? [{ name: 'Next milestone', value: phaseGoals[agent.phase] }] : []),
    ],
    accentOverride: accent,
  })

  const { sendChannelMessage } = await import('@/lib/discord')
  const announcementsChannel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'
  const result = await sendChannelMessage(announcementsChannel, { embeds: [card] })

  // Optional DM to the agent so they get a personal copy too.
  if (agent.discordUserId) {
    try {
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: agent.discordUserId }),
      })
      if (dmRes.ok) {
        const dm = await dmRes.json() as { id: string }
        await sendChannelMessage(dm.id, { embeds: [card] }).catch(() => {})
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, messageId: result.id })
}
