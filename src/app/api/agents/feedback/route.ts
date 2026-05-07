import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail as getProfileId } from '@/lib/agent-identity'

// GET /api/agents/feedback - the calling agent's own feedback history
// with status + response. Drives the "Your feedback" panel on the
// tracker so agents can see what they've submitted and where it landed.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const feedback = await db.agentFeedback.findMany({
    where: { agentProfileId: profileId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      category: true,
      message: true,
      status: true,
      reviewedAt: true,
      closedAt: true,
      createdAt: true,
      screenshotUrls: true,
    },
    take: 25,
  })

  return NextResponse.json({ feedback })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { message, category, screenshotUrls } = await req.json() as {
    message: string
    category?: string
    screenshotUrls?: string[]
  }
  if (!message || message.trim().length < 5) {
    return NextResponse.json({ error: 'Message too short' }, { status: 400 })
  }

  // Cap attached screenshots at 4. Validate each is a Vercel Blob URL
  // we issued (host check) so a malicious caller can't seed arbitrary
  // image URLs into the admin's feedback view.
  const cleanedShots = (screenshotUrls ?? [])
    .filter(u => typeof u === 'string' && /^https:\/\/[a-z0-9.-]*\.public\.blob\.vercel-storage\.com\//i.test(u))
    .slice(0, 4)

  const feedback = await db.agentFeedback.create({
    data: {
      agentProfileId: profileId,
      message: message.trim(),
      category: category ?? 'general',
      screenshotUrls: cleanedShots,
    },
  })

  // Fire-and-forget admin-activity ping so feedback isn't invisible
  // until someone manually opens /vault/feedback. Embed includes the
  // agent identity + a 300-char preview so the team can triage from
  // the channel alone.
  pingAdminActivity({
    feedbackId: feedback.id,
    agentProfileId: profileId,
    message: message.trim(),
    category: category ?? 'general',
    screenshotCount: cleanedShots.length,
    firstScreenshotUrl: cleanedShots[0] ?? null,
  }).catch(err => console.warn('[feedback POST] admin ping failed:', err))

  return NextResponse.json({ ok: true, id: feedback.id })
}

async function pingAdminActivity(args: {
  feedbackId: string
  agentProfileId: string
  message: string
  category: string
  screenshotCount: number
  firstScreenshotUrl: string | null
}): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_ADMIN_CHANNEL_ID) return
  const profile = await db.agentProfile.findUnique({
    where: { id: args.agentProfileId },
    select: { firstName: true, lastName: true, agentCode: true, phase: true },
  })
  if (!profile) return
  const { sendChannelMessage } = await import('@/lib/discord')
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const preview = args.message.length > 300 ? args.message.slice(0, 300) + '...' : args.message
  const fields = [
    { name: 'From', value: `${profile.firstName} ${profile.lastName} (${profile.agentCode}) · Phase ${profile.phase}`, inline: false },
    { name: 'Category', value: args.category, inline: true },
  ]
  if (args.screenshotCount > 0) {
    fields.push({
      name: 'Attachments',
      value: args.screenshotCount === 1 ? '1 screenshot' : `${args.screenshotCount} screenshots`,
      inline: true,
    })
  }
  await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
    embeds: [{
      title: '💬 New agent feedback',
      description: preview,
      color: 0x60A5FA,
      fields,
      // First screenshot gets inline-rendered in the embed so the team
      // can triage from the channel without having to click through.
      // Discord caps embed images at one per embed; remaining shots are
      // visible by opening /vault/feedback.
      image: args.firstScreenshotUrl ? { url: args.firstScreenshotUrl } : undefined,
      footer: { text: 'AFF Concierge · Open /vault/feedback to triage' },
      url: `${baseUrl}/vault/feedback`,
      timestamp: new Date().toISOString(),
    }],
  })
}
