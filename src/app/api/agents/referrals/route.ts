import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { autoAdvanceContactOnAgentCreation } from '@/lib/ghl-pipeline'
import { validateReferralEmail, checkReferralRateLimit } from '@/lib/referral-spam-guard'

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const referrals = await db.agentReferral.findMany({
    where: { referringAgentId: id.profileId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ referrals })
}

export async function POST(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error
  const profileId = id.profileId

  // Pull the referrer's name + block status. If an admin has flagged
  // them as a spam referrer, reject the submit outright with a clear
  // message naming the reason on file.
  const referrer = await db.agentProfile.findUnique({
    where: { id: profileId },
    select: {
      firstName: true, lastName: true, agentCode: true, avatarUrl: true, discordUserId: true,
      referralsBlockedAt: true, referralsBlockedReason: true,
    },
  })
  if (referrer?.referralsBlockedAt) {
    return NextResponse.json({
      error: `Your referral submissions have been paused by an admin${referrer.referralsBlockedReason ? `: ${referrer.referralsBlockedReason}` : ''}. Reach out to leadership to discuss.`,
    }, { status: 403 })
  }

  const body = await req.json() as {
    firstName: string
    lastName: string
    email: string
    phone?: string
    state?: string
    notes?: string
  }

  if (!body.firstName || !body.lastName || !body.email) {
    return NextResponse.json({ error: 'firstName, lastName, email required' }, { status: 400 })
  }

  // Spam defenses. Block obvious fake / placeholder / disposable
  // emails first, then enforce per-referrer rate limits so a single
  // agent can't flood the queue.
  const emailErr = validateReferralEmail(body.email)
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 })

  const rate = await checkReferralRateLimit(profileId)
  if (!rate.ok) {
    // If they pushed up against the daily cap multiple days in a
    // week, ping the admin channel so leadership sees the pattern.
    if (rate.trippedAbuseFlag && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
      try {
        const { sendChannelMessage } = await import('@/lib/discord')
        const refName = referrer ? `${referrer.firstName} ${referrer.lastName} (${referrer.agentCode})` : 'an agent'
        sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
          embeds: [{
            title: 'Referral abuse alert',
            description: `**${refName}** has hit the daily referral cap on multiple days this week. Submissions are being throttled. Review their referral list in the vault and confirm these are real recruits.`,
            color: 0xEF4444,
            timestamp: new Date().toISOString(),
            footer: { text: 'AFF Concierge · Spam guard' },
          }],
        }).catch(() => { /* non-critical */ })
      } catch { /* non-critical */ }
    }
    return NextResponse.json({ error: rate.reason ?? 'Rate limit hit' }, { status: 429 })
  }

  const existing = await db.agentReferral.findFirst({
    where: { email: body.email.toLowerCase(), status: { not: 'REJECTED' } },
  })
  if (existing) {
    return NextResponse.json({
      error: `This email (${body.email.toLowerCase()}) is already in your referral queue. Check "My Referrals" to see its status — no need to resubmit. If you're trying to refer someone different, double-check the email.`,
    }, { status: 409 })
  }

  const existingAgent = await db.agentUser.findUnique({
    where: { email: body.email.toLowerCase() },
  })
  if (existingAgent) {
    return NextResponse.json({
      error: `This email (${body.email.toLowerCase()}) belongs to an existing AFF agent, so we can't add them as a new referral. If you meant to refer someone else, double-check the email.`,
    }, { status: 409 })
  }

  const referral = await db.agentReferral.create({
    data: {
      referringAgentId: profileId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email.toLowerCase(),
      phone: body.phone,
      state: body.state,
      notes: body.notes,
    },
  })

  // Create a Contact in the recruiting pipeline so referrals show up
  // in the funnel. They start at "Engaged" since the agent vouched for them.
  try {
    await db.contact.upsert({
      where: { email: body.email.toLowerCase() },
      create: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email.toLowerCase(),
        phone: body.phone ?? null,
        state: body.state ?? null,
        source: 'referral',
        outreachStatus: 'responded',
        ghlPipelineStage: 'Engaged',
        ghlStageUpdatedAt: new Date(),
      },
      update: {
        // Don't overwrite if they already exist, just ensure they're in pipeline
        ghlPipelineStage: 'Engaged',
        ghlStageUpdatedAt: new Date(),
      },
    })
  } catch {
    // Non-fatal — referral creation already succeeded
  }

  // Fire-and-forget Discord ping so admins/LC see new pending approvals
  // without having to refresh the inbox. Includes Approve / Reject buttons
  // wired to /api/discord/interactions so the LC can act without leaving Discord.
  // The public #announcements celebration is intentionally NOT fired here —
  // it waits for approval and is posted from approveReferral() in
  // src/lib/referral-approval.ts. The CEO does not want the team celebrating
  // a recruit that staff hasn't reviewed yet.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      const refName = referrer ? `${referrer.firstName} ${referrer.lastName}` : 'An agent'
      sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: 'New Agent Referral',
          description: [
            `**${refName}** referred **${body.firstName} ${body.lastName}** to the team.`,
            '',
            `Email: ${body.email.toLowerCase()}`,
            body.phone ? `Phone: ${body.phone}` : '',
            body.state ? `State: ${body.state}` : '',
            body.notes ? `\nNotes: ${body.notes}` : '',
            '',
            '_Approve to send the welcome email and create the portal account._',
          ].filter(Boolean).join('\n'),
          color: 0xC9A96E,
          timestamp: new Date().toISOString(),
          footer: { text: 'AFF Concierge · Referrals' },
        }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Approve & Send Invite', custom_id: `referral-approve:${referral.id}` },
            { type: 2, style: 4, label: 'Reject',                custom_id: `referral-reject:${referral.id}` },
          ],
        }],
      }).catch((err) => {
        console.error('[referrals] admin Discord ping failed:', err)
      })
    } catch (err) {
      console.error('[referrals] admin Discord ping threw:', err)
    }
  } else if (process.env.DISCORD_BOT_TOKEN && !process.env.DISCORD_ADMIN_CHANNEL_ID) {
    // Loud warning so we notice if the env var goes missing in prod —
    // silently dropping the approve/reject panel means referrals pile up
    // in the queue with no staff visibility.
    console.warn('[referrals] DISCORD_ADMIN_CHANNEL_ID not set; admin approve/reject panel will not post')
  }

  return NextResponse.json(referral)
}
