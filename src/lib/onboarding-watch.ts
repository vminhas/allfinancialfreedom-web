/**
 * First-week onboarding watch.
 *
 * Surfaces agents who, past their first week, still haven't (1) joined
 * Discord or (2) completed onboarding training. The daily cron posts a
 * digest to the admin activity channel; the /vault/onboarding page and
 * its "post now" button reuse the exact same logic so the on-demand
 * report and the automated one never drift.
 */

import { db } from '@/lib/db'
import { sendChannelMessage } from '@/lib/discord'

// An agent is "past their first week" at this many days from their
// start date. That's when a missing Discord / onboarding becomes a
// flag worth chasing.
export const FIRST_WEEK_DAYS = 7

// Stop nagging after this many days. Without a ceiling the daily digest
// would slowly accumulate every never-completed account ever, drowning
// the genuinely-new agents leadership actually needs to chase. 45 days
// covers the full Phase 1 onboarding window with margin.
export const STALE_AFTER_DAYS = 45

// The canonical "onboarding training done" signal. This is the first
// Onboarding Academy class, the one expected inside week one. It's the
// same PhaseItem the portal, leaderboard and progression math read, so
// a trainer sign-off OR the agent's own check lands here. To require
// all three classes instead, add 'week2_onboarding'/'week3_onboarding'.
export const ONBOARDING_ITEM_KEYS = ['week1_onboarding'] as const

export interface OnboardingLaggard {
  agentProfileId: string
  name: string
  email: string
  recruiterId: string | null
  daysSinceStart: number
  joinedDiscord: boolean
  completedOnboarding: boolean
  // Training-excluded agents (staff/test/special cases) are not chased
  // about onboarding training, only about Discord.
  trainingExcluded: boolean
}

function startDateOf(p: { icaDate: Date | null; createdAt: Date }): Date {
  return p.icaDate ?? p.createdAt
}

/**
 * The current set of first-week laggards, most overdue first.
 *
 * An agent is included when, at FIRST_WEEK_DAYS..STALE_AFTER_DAYS past
 * their start date, they are still missing Discord and/or onboarding
 * training (the latter ignored for training-excluded agents).
 */
export async function getOnboardingLaggards(now = new Date()): Promise<OnboardingLaggard[]> {
  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      icaDate: true,
      createdAt: true,
      discordUserId: true,
      recruiterId: true,
      agentUser: { select: { email: true } },
      trainingExclusion: { select: { id: true } },
      phaseItems: {
        where: { phase: 1, itemKey: { in: [...ONBOARDING_ITEM_KEYS] } },
        select: { itemKey: true, completed: true },
      },
    },
  })

  const out: OnboardingLaggard[] = []

  for (const a of agents) {
    const start = startDateOf(a)
    const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / 86_400_000)
    if (daysSinceStart < FIRST_WEEK_DAYS || daysSinceStart > STALE_AFTER_DAYS) continue

    const joinedDiscord = a.discordUserId != null && a.discordUserId.length > 0
    const completedKeys = new Set(
      a.phaseItems.filter(pi => pi.completed).map(pi => pi.itemKey),
    )
    const completedOnboarding = ONBOARDING_ITEM_KEYS.every(k => completedKeys.has(k))
    const trainingExcluded = a.trainingExclusion != null

    const missingDiscord = !joinedDiscord
    const missingOnboarding = !completedOnboarding && !trainingExcluded
    if (!missingDiscord && !missingOnboarding) continue

    out.push({
      agentProfileId: a.id,
      name: `${a.firstName} ${a.lastName}`.trim(),
      email: a.agentUser.email,
      recruiterId: a.recruiterId,
      daysSinceStart,
      joinedDiscord,
      completedOnboarding,
      trainingExcluded,
    })
  }

  out.sort((x, y) => y.daysSinceStart - x.daysSinceStart)
  return out
}

const MAX_LINES = 20

/**
 * Build the admin-activity embed for a set of laggards. Returns null
 * when there's nothing to report so callers can skip empty posts.
 */
export function buildOnboardingEmbed(laggards: OnboardingLaggard[], now = new Date()) {
  if (laggards.length === 0) return null

  const lines = laggards.slice(0, MAX_LINES).map(l => {
    const discord = l.joinedDiscord ? '✅ Discord' : '❌ Discord'
    const onboarding = l.trainingExcluded
      ? '➖ Onboarding (excluded)'
      : l.completedOnboarding
        ? '✅ Onboarding'
        : '❌ Onboarding'
    return `• **${l.name}** · ${l.daysSinceStart}d in · ${discord} · ${onboarding}`
  })
  const overflow = laggards.length > MAX_LINES
    ? `\n\n_…and ${laggards.length - MAX_LINES} more_`
    : ''

  return {
    title: '🚨 Onboarding Watch',
    description: [
      `**${laggards.length}** agent${laggards.length === 1 ? ' is' : 's are'} past their first week without Discord and/or onboarding training.`,
      '',
      ...lines,
      overflow,
    ].filter(Boolean).join('\n'),
    color: 0xef4444,
    timestamp: now.toISOString(),
    footer: { text: 'AFF Concierge · first-week onboarding check' },
  }
}

/**
 * Post the laggard digest to the admin activity channel. No-op (and
 * reports posted=false) when the channel isn't configured or there's
 * nothing to report.
 */
export async function postOnboardingDigest(
  laggards: OnboardingLaggard[],
  now = new Date(),
): Promise<{ posted: boolean; messageId?: string }> {
  const channelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  const embed = buildOnboardingEmbed(laggards, now)
  if (!channelId || !process.env.DISCORD_BOT_TOKEN || !embed) {
    return { posted: false }
  }
  try {
    const msg = await sendChannelMessage(channelId, { embeds: [embed] })
    return { posted: true, messageId: msg.id }
  } catch {
    return { posted: false }
  }
}
