import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/settings'
import { sendChannelMessage } from '@/lib/discord'

// GET /api/cron/birthday-greetings
//
// Once a day, DM the Licensing Coordinator the list of agents whose
// birthday falls today so she can reach out. The LC's Discord user ID
// is configured in /vault/settings (LC_DISCORD_USER_ID); when it's
// blank the feature is simply off. Auth: Bearer CRON_SECRET (matches
// the other daily crons).
//
// Birthday match: AgentProfile.dateOfBirth is a date-only value stored
// at UTC midnight, so we compare its UTC month/day against "today" in
// America/New_York (the business timezone the other daily crons run
// against). Test + inactive profiles are excluded so the seed/QA
// accounts never trigger a greeting.

const TZ = 'America/New_York'

function todayParts(): { month: number; day: number; year: number; iso: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const year = get('year'), month = get('month'), day = get('day')
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { month, day, year, iso }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lcDiscordId = (await getSetting('LC_DISCORD_USER_ID')).trim()
  if (!lcDiscordId) {
    return NextResponse.json({ ok: true, skipped: 'LC_DISCORD_USER_ID not set' })
  }
  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ ok: true, skipped: 'DISCORD_BOT_TOKEN not set' })
  }

  const today = todayParts()

  // Idempotency: never DM twice for the same calendar day even if the
  // cron is retried. We only stamp this after a successful send, so a
  // failed attempt can still retry later in the day.
  const lastSent = (await getSetting('LC_BIRTHDAY_NOTIFY_LAST')).trim()
  if (lastSent === today.iso) {
    return NextResponse.json({ ok: true, skipped: 'already sent today', date: today.iso })
  }

  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false, dateOfBirth: { not: null } },
    select: {
      firstName: true, lastName: true, preferredName: true,
      agentCode: true, state: true, dateOfBirth: true,
    },
  })

  const birthdays = agents
    .filter(a => {
      const d = a.dateOfBirth!
      return d.getUTCMonth() + 1 === today.month && d.getUTCDate() === today.day
    })
    .map(a => {
      const name = `${a.preferredName?.trim() || a.firstName} ${a.lastName}`.trim()
      const age = today.year - a.dateOfBirth!.getUTCFullYear()
      return { name, agentCode: a.agentCode, state: a.state, age }
    })
    .sort((x, y) => x.name.localeCompare(y.name))

  if (birthdays.length === 0) {
    return NextResponse.json({ ok: true, date: today.iso, birthdays: 0 })
  }

  // Open (or fetch existing) DM channel with the LC, then post the embed.
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: lcDiscordId }),
  })
  if (!dmRes.ok) {
    return NextResponse.json(
      { ok: false, error: 'Could not open a DM with the configured Discord ID. Check LC_DISCORD_USER_ID.', status: dmRes.status },
      { status: 502 },
    )
  }
  const dm = await dmRes.json() as { id: string }

  const lines = birthdays.map(b => {
    const age = Number.isFinite(b.age) && b.age > 0 && b.age < 120 ? ` (turning ${b.age})` : ''
    const where = b.state ? `, ${b.state}` : ''
    return `🎂 **${b.name}**${age} &middot; ${b.agentCode}${where}`
  })

  await sendChannelMessage(dm.id, {
    embeds: [{
      title: birthdays.length === 1 ? 'Birthday today' : `Birthdays today (${birthdays.length})`,
      description: `${lines.join('\n')}\n\nA quick happy birthday from the team goes a long way.`,
      color: 0xc9a96e,
      footer: { text: 'AFF Concierge' },
      timestamp: new Date().toISOString(),
    }],
  })

  await setSetting('LC_BIRTHDAY_NOTIFY_LAST', today.iso)

  return NextResponse.json({ ok: true, date: today.iso, birthdays: birthdays.length })
}
