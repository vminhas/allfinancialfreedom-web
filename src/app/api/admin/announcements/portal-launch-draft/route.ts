import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { sendChannelMessage } from '@/lib/discord'

// One-shot endpoint to drop a hype-y portal-launch draft into the admin
// Discord channel for review before it goes wide. Idempotent: each call
// just re-posts the latest version of the embed, so editing the copy
// in this file and re-triggering the endpoint is the workflow.
//
// To preview a fresh edit: POST to this URL from the vault Announcements
// page (button) or curl it with admin auth. The post lands in
// DISCORD_ADMIN_CHANNEL_ID, NOT the agents-wide announcements channel.

const BRAND_GOLD = 0xC9A96E

export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const channelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!channelId || !botToken) {
    return NextResponse.json(
      { error: 'DISCORD_ADMIN_CHANNEL_ID or DISCORD_BOT_TOKEN not configured' },
      { status: 500 },
    )
  }

  // Hero embed: the "what is this" intro. Brief, vivid, sets tone.
  const heroEmbed = {
    title: '✦  T H E   A G E N T   P O R T A L   I S   L I V E  ✦',
    description: [
      '# Built for you. Built with you.',
      '',
      "Everything you need to run your business, recognize your wins, and grow your team. One place. Yours.",
      '',
      "Below is what just shipped. Get in there.",
    ].join('\n'),
    color: BRAND_GOLD,
    footer: { text: 'All Financial Freedom · Welcome to the new home.' },
    timestamp: new Date().toISOString(),
  }

  // Feature embed: structured fields, one per shipped capability. Order
  // by what an agent will care about most on day one (leaderboard +
  // contacts), with quieter wins (NPN auto-link) tucked underneath.
  const featuresEmbed = {
    title: 'What just shipped',
    color: BRAND_GOLD,
    fields: [
      {
        name: '🏆  Production Leaderboard',
        value: [
          'See where you stack up. Submissions, recruits, and points ranked **weekly, monthly, quarterly, YTD, and all-time**. Switch between **company-wide** and **your own downline**. Top 3 get the podium. Your row glows gold.',
          '_/agents/leaderboard_',
        ].join('\n'),
      },
      {
        name: '📊  Progression Matrix',
        value: [
          "Every checklist item, every phase, every active agent in one matrix. Know exactly what's left to hit **MD** or **EMD**.",
          '_/agents/leaderboard · second tab_',
        ].join('\n'),
      },
      {
        name: '👥  Business Partners + Contacts',
        value: [
          'Import your phone contacts. Classify each one as Partner, FTA lead, or recruit. Schedule FTAs, fire CEO intros, track every interaction.',
          '',
          "**New:** when one of your recruits gets onboarded and fills in their NPN, it shows up on your contact card. **Click to copy.** No more texting them before every submission.",
        ].join('\n'),
      },
      {
        name: '📅  FTA Scheduler',
        value: 'Book Field Training Appointments, mark attendance, build your team. The whole flow in two clicks.',
      },
      {
        name: '🎓  Phase Progression + Recognition',
        value: 'Hit a milestone, get a Discord promotion card. The whole team sees it. **Recognition is automatic now.**',
      },
      {
        name: '💬  Feedback Loop',
        value: "Got a bug? Got an idea? Send feedback right from the portal. We mark it acknowledged, in progress, or closed, and you'll see it on your portal **and** get a DM when something changes. Every voice gets heard.",
      },
      {
        name: '🎴  Your Trading Card',
        value: "NPN, license, phase, goals. Shareable. Copyable. Visit your profile to see it.",
      },
      {
        name: '✋  CEO Intro',
        value: "Have Vick send a warm intro to a Business Partner prospect, right from the contact card. One click.",
      },
    ],
    footer: { text: "If something feels broken or missing, send feedback right from the portal." },
  }

  // CTA embed: a tight last word. Keeps the hype embed and the feature
  // wall from being the final visual; ends on action.
  const ctaEmbed = {
    description: [
      '## First place is open.',
      '',
      "Log in. Look around. Then log a submission, refer an agent, or schedule an FTA. The leaderboard updates the moment you do.",
      '',
      '— Vick',
    ].join('\n'),
    color: BRAND_GOLD,
  }

  await sendChannelMessage(channelId, {
    content: '**[DRAFT]** Portal-launch announcement preview. Reply with edits or approve for wider posting.',
    embeds: [heroEmbed, featuresEmbed, ctaEmbed],
  })

  return NextResponse.json({ ok: true })
}
