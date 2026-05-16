import { db } from '@/lib/db'
import { sendChannelMessage } from '@/lib/discord'
import { getSetting, setSetting } from '@/lib/settings'
import { MOTIVATION_SEED, dailyIndex } from '@/lib/motivation-quotes'

export interface MotivationLine {
  text: string
  attribution: string | null
}

// Shared logic for the daily-motivation feature, used by both the weekday
// cron (/api/cron/daily-motivation) and the vault "Send now" button so the
// two never drift apart in how a post looks or which line is chosen.

export const SETTING_ENABLED = 'MOTIVATION_ENABLED'
export const SETTING_CHANNEL = 'MOTIVATION_CHANNEL_ID'
export const SETTING_LAST_POSTED = 'MOTIVATION_LAST_POSTED_DATE'

// Final fallback if neither a setting nor an env override is present.
// Matches the announcements channel used elsewhere in the codebase.
const DEFAULT_CHANNEL = '1295044213590982724'

// Morning motivation gets its OWN look, on purpose. The achievement-card
// family (milestones, promotions, recognition) owns the gold / platinum /
// phase palette with the ✦ B A N N E R ✦ titles and the "All Financial
// Freedom · …" footer. If the daily nudge wears that same costume, a card
// stops feeling earned: when everyone gets a gold card every single
// morning, a real recognition card reads as just another Tuesday. So this
// is deliberately warm and casual instead: a sunrise accent that appears
// nowhere in the card palette, a plain greeting, a light footer, no
// timestamp. Inspiring, not ceremonial.
const SUNRISE = 0xff8c42

// Insert the static seed exactly once. After this the vault editor is the
// source of truth; we never re-sync from the file so CEO edits are not
// clobbered on deploy. Idempotent: a non-empty table is left untouched.
export async function ensureMotivationSeeded(): Promise<void> {
  const count = await db.motivationQuote.count()
  if (count > 0) return
  await db.motivationQuote.createMany({
    data: MOTIVATION_SEED.map((q, i) => ({
      text: q.text,
      voice: q.voice,
      attribution: q.attribution,
      active: true,
      sortKey: i,
    })),
  })
}

// Active lines in the stable order the deterministic picker walks. Order
// is (sortKey, createdAt, id) so toggling a line inactive or adding a new
// one does not reshuffle the existing rotation.
export async function getActiveQuotes(): Promise<MotivationLine[]> {
  await ensureMotivationSeeded()
  const rows = await db.motivationQuote.findMany({
    where: { active: true },
    orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { text: true, attribution: true },
  })
  return rows.map(r => ({ text: r.text, attribution: r.attribution }))
}

// The exact embed body for a line, so the cron, "Send now", and the
// vault preview all render identically. No em-dashes (project rule).
//
// Bold, not block-quoted: a `>` quote reads like a framed citation (the
// recognition-card look we are moving away from). A single bold line
// lands like a coach saying it to your face, which is the casual,
// inspiring register we want for the morning.
export function renderMotivationBody(line: MotivationLine): string {
  const credit = line.attribution ? `\n\n*in the spirit of ${line.attribution}*` : ''
  return `**${line.text}**${credit}`
}

export async function isMotivationEnabled(): Promise<boolean> {
  const v = await getSetting(SETTING_ENABLED)
  // Default ON: only an explicit 'false' disables it.
  return v !== 'false'
}

export async function setMotivationEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_ENABLED, enabled ? 'true' : 'false')
}

// Setting wins, then env overrides, then the hardcoded announcements id.
export async function getMotivationChannelId(): Promise<string> {
  const fromSetting = (await getSetting(SETTING_CHANNEL)).trim()
  if (fromSetting) return fromSetting
  return (
    process.env.DISCORD_MOTIVATION_CHANNEL_ID ??
    process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ??
    DEFAULT_CHANNEL
  )
}

export async function setMotivationChannelId(channelId: string): Promise<void> {
  await setSetting(SETTING_CHANNEL, channelId.trim())
}

export async function getLastPostedDate(): Promise<string> {
  return getSetting(SETTING_LAST_POSTED)
}

export function todayUtcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10) // YYYY-MM-DD
}

// The line that will (or did) post for a given date, computed over the
// live active library. Used for the cron, the "Send now" action, and the
// vault preview so all three agree. Null only when the library is empty.
export async function getQuoteForDate(date: Date = new Date()): Promise<MotivationLine | null> {
  const pool = await getActiveQuotes()
  if (pool.length === 0) return null
  return pool[dailyIndex(date, pool.length)]
}

// Post today's line to the configured channel with no pings. Records the
// post date so a later same-day cron fire is skipped (prevents a double
// post when an admin uses "Send now" earlier in the day). The caller owns
// the enabled / weekend / once-per-day policy; this just sends.
export async function postDailyMotivation(
  now: Date = new Date(),
): Promise<{ text: string }> {
  if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_BOT_TOKEN not configured')
  }
  const line = await getQuoteForDate(now)
  if (!line) {
    throw new Error('No active motivation lines to post')
  }
  const channelId = await getMotivationChannelId()

  await sendChannelMessage(channelId, {
    embeds: [{
      title: '☀️  Good morning, team',
      description: renderMotivationBody(line),
      color: SUNRISE,
      footer: { text: 'Now go make it a good one.' },
    }],
    // Explicitly no pings. This is a daily nudge, not an announcement.
    allowedMentions: { parse: [] },
  })

  await setSetting(SETTING_LAST_POSTED, todayUtcDate(now))
  return { text: line.text }
}
