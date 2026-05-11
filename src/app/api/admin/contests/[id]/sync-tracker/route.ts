import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getContestParticipants } from '@/lib/contests'

// POST /api/admin/contests/[id]/sync-tracker
//
// Posts a live tracker embed to the channel pinned on
// Contest.discordChannelId, OR edits the existing message in place
// if Contest.discordTrackerMessageId is set. Returns the message
// URL so the admin gets a click-through to verify.
//
// The embed lists each eligible agent grouped into sections (At
// risk / In progress / Earned / Missed) with their per-agent days
// remaining, progress, and a Discord @-mention when we have their
// discordUserId. Bot edits the same message every sync, keeping
// the channel clean.

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

const COLOR_BY_STATUS = {
  earned: 0x4ade80,   // green
  inProgress: 0xC9A96E, // gold
  atRisk: 0xf59e0b,   // amber
  missed: 0xf87171,   // red
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({})) as { channelId?: string }
  const contest = await db.contest.findUnique({
    where: { id },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })
  if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 })

  // Channel can come from the request (admin sets/updates it on
  // sync) or from a previously-saved value on the contest.
  const channelId = body.channelId?.trim() || contest.discordChannelId
  if (!channelId) {
    return NextResponse.json({ error: 'discordChannelId required (set it on the contest or pass channelId in the body)' }, { status: 400 })
  }
  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  // Resolve participants + discord IDs in a single batch.
  const participants = await getContestParticipants(id)
  const profileIds = participants.map(p => p.agentProfileId)
  const discordById = profileIds.length === 0
    ? new Map<string, string | null>()
    : new Map(
        (await db.agentProfile.findMany({
          where: { id: { in: profileIds } },
          select: { id: true, discordUserId: true },
        })).map(p => [p.id, p.discordUserId])
      )

  // Bucket by status. At-risk = <=7 days, incomplete. In-progress =
  // anything in-window not yet qualified. Earned = qualified. Missed
  // = expired without qualifying.
  const earned: typeof participants = []
  const atRisk: typeof participants = []
  const inProgress: typeof participants = []
  const missed: typeof participants = []
  for (const p of participants) {
    if (p.qualified) earned.push(p)
    else if (p.expired) missed.push(p)
    else if (p.daysRemaining <= 7) atRisk.push(p)
    else inProgress.push(p)
  }
  earned.sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())
  atRisk.sort((a, b) => a.daysRemaining - b.daysRemaining)
  inProgress.sort((a, b) => a.daysRemaining - b.daysRemaining)
  missed.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())

  const renderRow = (p: typeof participants[number], showDays = true) => {
    const did = discordById.get(p.agentProfileId)
    const who = did ? `<@${did}>` : `**${p.firstName} ${p.lastName}**`
    const code = `\`${p.agentCode}\``
    const progress = `${p.completedCount}/${p.totalCount}`
    if (!showDays) return `${who} ${code} ${progress}`
    return `${who} ${code} ${progress} · ${p.expired ? 'expired' : `${p.daysRemaining}d`}`
  }

  // Discord embed field values are capped at 1024 chars. Truncate
  // each section to ~20 rows so we don't blow past the limit on big
  // cohorts; admins can click through to the portal for the full
  // list.
  const cap = (rows: string[], n = 20) =>
    rows.length <= n ? rows.join('\n') : rows.slice(0, n).join('\n') + `\n…and ${rows.length - n} more`

  const reward = contest.rewardLabel
    ?? (contest.rewardAmount != null ? `$${contest.rewardAmount.toLocaleString()}` : 'this bonus')
  const windowSummary = contest.anchor === 'FIXED'
    ? `Fixed window ${contest.fixedStartAt?.toISOString().slice(0, 10) ?? '?'} → ${contest.fixedEndAt?.toISOString().slice(0, 10) ?? '?'}`
    : `${contest.durationDays ?? '?'} days from ${anchorLabel(contest.anchor)}`

  const fields: Array<{ name: string; value: string; inline?: boolean }> = []
  if (atRisk.length > 0) {
    fields.push({ name: `🚨 At risk · ≤7 days, incomplete (${atRisk.length})`, value: cap(atRisk.map(p => renderRow(p))) })
  }
  if (inProgress.length > 0) {
    fields.push({ name: `🟢 In progress (${inProgress.length})`, value: cap(inProgress.map(p => renderRow(p))) })
  }
  if (earned.length > 0) {
    fields.push({ name: `✅ Earned (${earned.length})`, value: cap(earned.map(p => renderRow(p, false))) })
  }
  if (missed.length > 0) {
    fields.push({ name: `❌ Missed (${missed.length})`, value: cap(missed.map(p => renderRow(p, false))) })
  }
  if (fields.length === 0) {
    fields.push({ name: 'No eligible agents yet', value: 'When agents whose ICA / onboarding falls in the eligibility window join, they\'ll appear here.' })
  }

  const color = atRisk.length > 0
    ? COLOR_BY_STATUS.atRisk
    : earned.length > 0
      ? COLOR_BY_STATUS.earned
      : COLOR_BY_STATUS.inProgress

  const reqList = contest.requirements.map((r, i) => `${i + 1}. ${r.label}`).join('\n')

  const embed = {
    title: `🏆 ${reward} · ${contest.title}`,
    description: `${contest.description ?? ''}\n\n**Window:** ${windowSummary}\n**Requirements:**\n${reqList}`.trim(),
    color,
    fields,
    footer: { text: `Live tracker · ${participants.length} eligible · Refreshed ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` },
    timestamp: new Date().toISOString(),
  }

  // Post-or-edit. If we have a message ID, try editing first; on
  // 404 (message deleted) fall through to a new post so the tracker
  // self-recovers.
  const headers = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }
  let messageId = contest.discordTrackerMessageId
  let editOk = false
  if (messageId) {
    const editRes = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      { method: 'PATCH', headers, body: JSON.stringify({ embeds: [embed] }) }
    )
    editOk = editRes.ok
  }
  if (!editOk) {
    const postRes = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      { method: 'POST', headers, body: JSON.stringify({ embeds: [embed] }) }
    )
    if (!postRes.ok) {
      const text = await postRes.text().catch(() => '')
      return NextResponse.json({ error: `Discord post failed: ${postRes.status} ${text}` }, { status: 502 })
    }
    const created = await postRes.json() as { id: string }
    messageId = created.id
  }

  // Save the channel + message IDs so the next sync edits in place.
  await db.contest.update({
    where: { id },
    data: { discordChannelId: channelId, discordTrackerMessageId: messageId },
  })

  return NextResponse.json({
    messageId,
    messageUrl: `https://discord.com/channels/@me/${channelId}/${messageId}`,
    counts: {
      total: participants.length,
      earned: earned.length,
      inProgress: inProgress.length,
      atRisk: atRisk.length,
      missed: missed.length,
    },
  })
}

function anchorLabel(anchor: string): string {
  switch (anchor) {
    case 'ICA_DATE':    return 'ICA date'
    case 'ONBOARDING':  return 'onboarding'
    case 'PHASE_START': return 'phase start'
    case 'FIXED':       return 'window'
    default:            return 'start'
  }
}
