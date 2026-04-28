import { NextRequest, NextResponse } from 'next/server'
import {
  verifyDiscordSignature,
  InteractionType,
  InteractionResponseType,
  MessageFlags,
  editOriginalInteractionResponse,
} from '@/lib/discord-interactions'
import { approveReferral } from '@/lib/referral-approval'
import { db } from '@/lib/db'

// Discord interactions endpoint. Called whenever someone clicks a button
// (or runs a slash command, etc.) on a message our bot posted.
//
// Setup: in the Discord developer portal under General Information set the
// "Interactions Endpoint URL" to https://YOUR-DOMAIN/api/discord/interactions.
// Discord sends a PING when saving — we must respond with PONG using the
// same Ed25519 signature scheme as real interactions, so DISCORD_PUBLIC_KEY
// must be set first.
//
// Auth model for the approve button: anyone with access to the admin channel
// can click. The channel ACL is the auth boundary. We log the Discord
// username of whoever clicked into the AgentReferral row and into the edited
// embed for the audit trail.

export const runtime = 'nodejs'

interface DiscordInteraction {
  type: number
  id: string
  application_id: string
  token: string
  data?: { custom_id?: string; component_type?: number }
  member?: { user?: { id: string; username: string; global_name?: string | null } }
  user?: { id: string; username: string; global_name?: string | null }
  message?: { embeds?: Record<string, unknown>[] }
}

export async function POST(req: NextRequest) {
  // Discord requires us to verify the Ed25519 signature on every call. The
  // signature is over (timestamp + raw body) so we can't use req.json() before
  // verifying — read the raw text first.
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const rawBody = await req.text()

  if (!signature || !timestamp || !verifyDiscordSignature(rawBody, signature, timestamp)) {
    return new NextResponse('invalid request signature', { status: 401 })
  }

  let interaction: DiscordInteraction
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction
  } catch {
    return new NextResponse('bad json', { status: 400 })
  }

  // PING — Discord verification handshake during endpoint setup.
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG })
  }

  // Button click on a referral notification.
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id ?? ''
    if (customId.startsWith('referral-approve:')) {
      const referralId = customId.slice('referral-approve:'.length)
      return handleReferralApprove(interaction, referralId)
    }
    if (customId.startsWith('referral-reject:')) {
      const referralId = customId.slice('referral-reject:'.length)
      return handleReferralReject(interaction, referralId)
    }
  }

  // Anything we don't recognize — return an ephemeral fallback so the user
  // sees a clear "nothing happened" instead of a hung interaction.
  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "I don't know how to handle that yet.", flags: MessageFlags.EPHEMERAL },
  })
}

function clickerLabel(interaction: DiscordInteraction): string {
  const u = interaction.member?.user ?? interaction.user
  if (!u) return 'someone'
  return u.global_name ?? u.username
}

async function handleReferralApprove(interaction: DiscordInteraction, referralId: string) {
  const clicker = clickerLabel(interaction)

  // The approval is heavier than 3s sometimes (DB writes + GHL email round
  // trip), so we acknowledge with DEFERRED_UPDATE_MESSAGE and finish the
  // work in the background. Discord keeps the original embed visible until
  // we PATCH it via the followup webhook.
  const result = await approveReferral({
    referralId,
    approvedById: `discord:${clicker}`,
  })

  // Build the post-approval embed in either success or error shape.
  const baseEmbed = interaction.message?.embeds?.[0] ?? {}

  if (!result.ok) {
    // Edit the original message inline to show the failure but keep the
    // approve button removed so we don't double-submit on retry.
    return NextResponse.json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [{
          ...baseEmbed,
          title: '⚠️ Approval Failed',
          color: 0xEF4444,
          footer: { text: `Tried by ${clicker} · ${result.error ?? 'unknown error'}` },
        }],
        components: [],  // strip the buttons
      },
    })
  }

  // Success — strip buttons, recolor green, append who approved + when.
  const referral = await db.agentReferral.findUnique({
    where: { id: referralId },
    select: { firstName: true, lastName: true },
  })
  const clientName = referral ? `${referral.firstName} ${referral.lastName}` : 'the referral'

  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        title: '✅ Approved',
        description: `**${clientName}** has been approved and the welcome email is on its way.${result.emailSent ? '' : '\n\n_Welcome email send did not confirm — re-send from My Team if needed._'}`,
        color: 0x4ADE80,
        footer: { text: `Approved by ${clicker} · Agent code ${result.agentCode}` },
        timestamp: new Date().toISOString(),
      }],
      components: [],
    },
  })
}

async function handleReferralReject(interaction: DiscordInteraction, referralId: string) {
  const clicker = clickerLabel(interaction)
  const referral = await db.agentReferral.findUnique({
    where: { id: referralId },
    select: { status: true, firstName: true, lastName: true },
  })
  if (!referral) {
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Referral not found.', flags: MessageFlags.EPHEMERAL },
    })
  }
  if (referral.status !== 'PENDING') {
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Already ${referral.status.toLowerCase()}.`, flags: MessageFlags.EPHEMERAL },
    })
  }

  await db.agentReferral.update({
    where: { id: referralId },
    data: {
      status: 'REJECTED',
      approvedAt: new Date(),
      approvedById: `discord:${clicker}`,
    },
  })

  const baseEmbed = interaction.message?.embeds?.[0] ?? {}
  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{
        ...baseEmbed,
        title: '🚫 Rejected',
        description: `**${referral.firstName} ${referral.lastName}**'s referral was rejected.`,
        color: 0x6B7280,
        footer: { text: `Rejected by ${clicker}` },
        timestamp: new Date().toISOString(),
      }],
      components: [],
    },
  })
}

// Suppress unused-import lint — editOriginalInteractionResponse is exported
// from the lib for future flows that need to follow up after a deferred
// response. This route uses synchronous UPDATE_MESSAGE so we don't call it.
void editOriginalInteractionResponse
