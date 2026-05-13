import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listChannelMessages, type DiscordChannelMessage } from '@/lib/discord'
import { parseIcaPdf } from '@/lib/parse-ica'

// Cron: scan the admin Discord channel for new ICA PDFs.
//
// Runs every 5 minutes (see vercel.json crons). Workflow:
//   1. Find the newest IcaSubmission with a source_message_id — that's our
//      high-water mark. On a cold DB we scan the most recent 50 messages.
//   2. Fetch messages after that snowflake. Discord's "after" cursor
//      returns newest-first, capped at 100.
//   3. For each new message: if it has a PDF attachment we haven't seen,
//      download it, run parseIcaPdf, and write one IcaSubmission row per
//      PDF. status='PENDING' on success, 'PARSE_FAILED' on Claude error.
//
// Idempotency comes from the unique index on source_message_id — a re-run
// of the cron during the same minute won't double-insert. We also dedupe
// by attachment URL inside a single message in case admins drop two PDFs
// in one drag.
//
// All work is best-effort: any unexpected throw bubbles to the response
// JSON but the cron still returns 200 so Vercel doesn't keep retrying a
// systemic failure (e.g. ANTHROPIC_API_KEY unset on a preview deploy).

const BATCH_SIZE = 50

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured', processed: 0 }, { status: 200 })
  }
  const channelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  if (!channelId) {
    return NextResponse.json({ error: 'DISCORD_ADMIN_CHANNEL_ID not configured', processed: 0 }, { status: 200 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured', processed: 0 }, { status: 200 })
  }

  // High-water mark: newest message id we've already processed. Discord
  // snowflake ids sort lexically by time, so plain Math.max on strings
  // works for finding "after" cursor.
  const latest = await db.icaSubmission.findFirst({
    where: { sourceMessageId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { sourceMessageId: true },
  })

  let messages: DiscordChannelMessage[] = []
  try {
    messages = await listChannelMessages(channelId, {
      limit: BATCH_SIZE,
      ...(latest?.sourceMessageId ? { after: latest.sourceMessageId } : {}),
    })
  } catch (err) {
    console.error('[scan-ica-pdfs] listChannelMessages failed:', err)
    return NextResponse.json({ error: 'discord_list_failed', processed: 0 }, { status: 200 })
  }

  let processed = 0
  let failed = 0
  const errors: Array<{ messageId: string; error: string }> = []

  // Process oldest-first so the high-water mark advances monotonically
  // and a mid-batch failure leaves a sensible "resume here" cursor.
  messages.reverse()

  for (const msg of messages) {
    const pdfAttachments = msg.attachments.filter(a =>
      (a.content_type ?? '').startsWith('application/pdf') ||
      a.filename.toLowerCase().endsWith('.pdf'),
    )
    if (pdfAttachments.length === 0) continue

    // De-dupe inside the message: if two attachments share a URL,
    // process the first only. Across messages, the source_message_id
    // unique index is the guard.
    const seenUrls = new Set<string>()
    for (const att of pdfAttachments) {
      if (seenUrls.has(att.url)) continue
      seenUrls.add(att.url)

      // Skip if a submission already exists for this message. Cheap
      // belt to the unique-index suspenders below — saves an
      // anthropic call when the cron overlaps itself.
      const existing = await db.icaSubmission.findUnique({
        where: { sourceMessageId: msg.id },
        select: { id: true },
      })
      if (existing) continue

      try {
        const dl = await fetch(att.url)
        if (!dl.ok) throw new Error(`download failed: ${dl.status}`)
        const pdfBytes = Buffer.from(await dl.arrayBuffer())

        const parsed = await parseIcaPdf(pdfBytes, { filename: att.filename })

        await db.icaSubmission.create({
          data: {
            status: 'PENDING',
            sourceType: 'discord',
            sourceMessageId: msg.id,
            sourceChannelId: msg.channel_id,
            sourceAuthorDiscordId: msg.author.id,
            sourceAttachmentUrl: att.url,
            pdfFilename: att.filename,
            parsedRaw: parsed.extraction as object,
            firstName: parsed.extraction.firstName,
            middleName: parsed.extraction.middleName,
            lastName: parsed.extraction.lastName,
            email: parsed.extraction.email?.toLowerCase() ?? null,
            dob: parsed.extraction.dob ? new Date(parsed.extraction.dob) : null,
            gender: parsed.extraction.gender,
            maritalStatus: parsed.extraction.maritalStatus,
            spouseName: parsed.extraction.spouseName,
            addressLine1: parsed.extraction.addressLine1,
            city: parsed.extraction.city,
            state: parsed.extraction.state,
            zip: parsed.extraction.zip,
            country: parsed.extraction.country,
            referenceCode: parsed.extraction.referenceCode?.toUpperCase() ?? null,
            classification: parsed.extraction.classification,
            hasLicense: parsed.extraction.hasLicense,
          },
        })
        processed += 1
      } catch (err) {
        failed += 1
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push({ messageId: msg.id, error: errMsg })
        // Record the failure so the same message isn't re-tried on every
        // cron tick. Admin can re-trigger from the review UI if it was a
        // transient Claude error.
        await db.icaSubmission.create({
          data: {
            status: 'PARSE_FAILED',
            sourceType: 'discord',
            sourceMessageId: msg.id,
            sourceChannelId: msg.channel_id,
            sourceAuthorDiscordId: msg.author.id,
            sourceAttachmentUrl: att.url,
            pdfFilename: att.filename,
            parseError: errMsg.slice(0, 2000),
          },
        }).catch(insertErr => {
          // If even the failure row can't be written (e.g. duplicate
          // message id from a race), log and move on. The cron will
          // skip this message next tick via the existing-check above.
          console.error('[scan-ica-pdfs] failed to record PARSE_FAILED:', insertErr)
        })
      }

      // Only the first PDF per message becomes an IcaSubmission row —
      // the unique constraint on source_message_id forbids two. If a
      // recruit ever ships two ICAs in one Discord post, the second
      // gets dropped (admin can re-upload). Acceptable trade for the
      // strong idempotency guarantee.
      break
    }
  }

  return NextResponse.json({ processed, failed, scanned: messages.length, errors })
}
