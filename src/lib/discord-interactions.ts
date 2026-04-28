import { createPublicKey, verify } from 'crypto'

// Discord interaction signature verification (Ed25519). Discord signs every
// interaction request with the bot's public key — we MUST verify it before
// trusting the body, otherwise anyone on the internet could fake button clicks.
//
// Required env: DISCORD_PUBLIC_KEY (the application's public key, shown in
// the Discord developer portal under General Information).
//
// Headers Discord sends:
//   X-Signature-Ed25519: hex-encoded signature
//   X-Signature-Timestamp: unix timestamp
//
// The signed payload is the concatenation of (timestamp + raw body).

let cachedKey: ReturnType<typeof createPublicKey> | null = null

function getPublicKey() {
  if (cachedKey) return cachedKey
  const hex = process.env.DISCORD_PUBLIC_KEY
  if (!hex) throw new Error('DISCORD_PUBLIC_KEY env var is not set')
  // Ed25519 public keys are 32 raw bytes. Wrap them in the SPKI DER prefix
  // so Node's crypto API can ingest them as a KeyObject.
  const ED25519_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
  const rawKey = Buffer.from(hex, 'hex')
  const der = Buffer.concat([ED25519_DER_PREFIX, rawKey])
  cachedKey = createPublicKey({ key: der, format: 'der', type: 'spki' })
  return cachedKey
}

export function verifyDiscordSignature(rawBody: string, signature: string, timestamp: string): boolean {
  if (!signature || !timestamp) return false
  try {
    const message = Buffer.from(timestamp + rawBody, 'utf8')
    const sig = Buffer.from(signature, 'hex')
    return verify(null, message, getPublicKey(), sig)
  } catch {
    return false
  }
}

// Discord interaction types we care about.
export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const

// Discord interaction-callback types we use.
export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
} as const

// Message flags. EPHEMERAL = only the clicker sees it.
export const MessageFlags = {
  EPHEMERAL: 64,
} as const

// Edit the original message that a component interaction came from. Used to
// finalize the embed after deferring an UPDATE_MESSAGE response.
export async function editOriginalInteractionResponse(
  applicationId: string,
  interactionToken: string,
  body: { embeds?: unknown[]; components?: unknown[]; content?: string }
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
