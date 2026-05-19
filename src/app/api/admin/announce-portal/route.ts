import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'

export const runtime = 'nodejs'

// POST { confirm: true } — posts the branded "new portal" announcement
// embed to the Discord announcements channel, as the concierge bot.
// Admin-triggered from /vault/settings. Posts every time it's pressed
// (no idempotency guard) since re-announcing is sometimes intentional;
// the UI confirms first.
const ANNOUNCEMENTS_CHANNEL =
  process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? '1295044213590982724'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not set' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({})) as { confirm?: boolean }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true } to post.' }, { status: 400 })
  }

  const description = [
    'Tonight we officially unveiled your new Agent Portal. A few of you had early access; now it is open to everyone. Here is a tour of the key features.',
    '',
    '**🚀 Your Roadmap**',
    'Every phase, checklist item, and next step in one place, with live progress and your current title as you advance.',
    '',
    '**👥 My Team**',
    "See your whole downline as a tree with each person's phase, progress, and last activity. Drill into their contacts and Personal Financial Review status, send a one-tap PFR reminder, and (for leadership) keep running coaching notes on each agent.",
    '',
    '**📇 Contacts CRM**',
    'Import your phone contacts, classify each as a Business Partner or FTA, move them between lanes anytime, send the CEO intro, and book appointments straight from the contact.',
    '',
    '**📊 Personal Financial Review**',
    'The interactive PFR tool with live D.I.M.E. and budget breakdowns. Your trainer and upline can view it (read only) to coach you through it.',
    '',
    '**📝 New Business & Field Training**',
    'Log FTAs, submit new business, and track every policy with a threaded notes history so nothing slips.',
    '',
    '**🎖️ Promotions & Recognition**',
    'Request your promotion right in the portal. Leadership can approve it on the spot, and the celebration drops right here in Discord. Milestones and badges track your climb.',
    '',
    '**🎧 Licensing Support**',
    'Open a licensing request from the portal and track it to resolution. The Licensing Coordinator can now satisfy requests directly from her inbox, so you get unblocked faster.',
    '',
    '**🔔 Notifications, Referrals & More**',
    'In-app and Discord notifications keep you in the loop, refer new agents in a tap, and the whole portal works great on your phone.',
    '',
    '**⏰ Please log in within 48 hours**',
    'Activate your portal within the next 48 hours so your access is confirmed and your onboarding stays on track.',
    '',
    '**📩 Did not get your portal invite?**',
    "If you have not received an invite, or you haven't been able to log in yet, reply right here in this channel and we will get you set up.",
  ].join('\n')

  const { sendChannelMessage } = await import('@/lib/discord')
  try {
    await sendChannelMessage(ANNOUNCEMENTS_CHANNEL, {
      embeds: [{
        title: '✨ The New Agent Portal Is Live',
        description,
        color: 0xc9a96e,
        footer: { text: 'All Financial Freedom · AFF Concierge' },
        timestamp: new Date().toISOString(),
      }],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to post to Discord' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
