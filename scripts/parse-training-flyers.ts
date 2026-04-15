/**
 * One-off proof-of-concept: parse every training flyer in
 * ~/Downloads/One Link ( GFI Weekly Training)/ via Claude vision and print
 * the structured JSON. No DB, no cron — this just validates that Claude
 * can reliably extract the fields before we build the production pipeline.
 *
 * Run: npx tsx scripts/parse-training-flyers.ts
 *
 * Cost: ~$0.02 per image × ~24 images = ~$0.50
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import * as dotenv from 'dotenv'
import { getSetting } from '../src/lib/settings'

dotenv.config()

async function loadAnthropicKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const key = await getSetting('ANTHROPIC_API_KEY')
  if (!key) throw new Error('No ANTHROPIC_API_KEY in env or DB settings')
  return key
}

const FOLDER = '/Users/melineeminhas/Downloads/One Link ( GFI Weekly Training)'
const MODEL = 'claude-sonnet-4-5-20250929'

const SYSTEM_PROMPT = `You are an extraction system for GFI / All Financial Freedom training event flyers.

Each image is a single training event flyer from GFI (Global Financial Impact). They follow a consistent layout:
- Title (large) — sometimes with a smaller subtitle below
- Optional category banner (e.g. "Technology Tuesday", "Wednesday Workshop")
- 1, 2, or 3 presenter portraits with name + role beneath each
- Date in the format "DAY | MONTH DAY, YEAR" (e.g. "MONDAY | APRIL 13, 2026")
- Time across multiple time zones (HST | PST | MST | CST | EST/ET) — always extract the EST/EDT time as the canonical
- Stream platform: usually "GFI Live - Impact TV" with a numeric stream ID and passcode, OR a regular Zoom meeting with Meeting ID + passcode
- Sometimes a partner brand logo (Tevah, Allianz, Corebridge, F&G, Quantum, American Equity, Ethos, etc.)
- Sometimes an audience restriction (e.g. "CFTs & Above Only", "For MD's & Above & Operations Staff Only")
- Sometimes a country/region targeting (e.g. "for Canada", "Puerto Rico Launch")

Extract all fields via the submit_event tool. If a field isn't visible, set it to null. For times, return ISO 8601 with the ET offset.

Some flyers may contain MULTIPLE events on one image (rare — usually a weekly schedule poster). If that's the case, return events as an array. Otherwise return a single-element array.`

interface ParsedEvent {
  title: string
  subtitle: string | null
  category: string | null
  startsAtET: string
  durationMinutes: number
  presenters: { name: string; role: string }[]
  streamType: 'GFI_LIVE' | 'ZOOM'
  streamRoomName: string | null
  streamId: string | null
  passcode: string | null
  audienceRestriction: string | null
  partnerBrand: string | null
  targetRegion: string | null
}

interface ParseResult {
  fileName: string
  events: ParsedEvent[]
  inputTokens: number
  outputTokens: number
  costUsd: number
  error?: string
}

async function parseImage(client: Anthropic, fileName: string, imageBytes: Buffer): Promise<ParseResult> {
  const base64 = imageBytes.toString('base64')
  const ext = extname(fileName).slice(1).toLowerCase()
  const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'submit_event',
          description: 'Submit the structured event data extracted from the flyer.',
          input_schema: {
            type: 'object',
            required: ['events'],
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['title', 'startsAtET', 'presenters', 'streamType'],
                  properties: {
                    title:               { type: 'string', description: 'Main event title (uppercase OK)' },
                    subtitle:            { type: ['string', 'null'], description: 'Smaller secondary line under the main title, if any' },
                    category:            { type: ['string', 'null'], description: 'Category banner text like "Technology Tuesday" or "Wednesday Workshop"' },
                    startsAtET:          { type: 'string', description: 'ISO 8601 datetime in Eastern Time (with -04:00 or -05:00 offset). Use the EST/EDT line on the flyer.' },
                    durationMinutes:     { type: 'integer', description: 'Default to 60 if not visible' },
                    presenters: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['name', 'role'],
                        properties: {
                          name: { type: 'string' },
                          role: { type: 'string', description: 'Title + company if visible (e.g. "CTO of GFI", "National Vice President")' },
                        },
                      },
                    },
                    streamType:          { type: 'string', enum: ['GFI_LIVE', 'ZOOM'], description: 'GFI_LIVE for "GFI Live - Impact TV"; ZOOM for regular Zoom meetings' },
                    streamRoomName:      { type: ['string', 'null'], description: 'e.g. "GFI Live - Impact TV"' },
                    streamId:            { type: ['string', 'null'], description: 'Stream ID or Meeting ID, with original spacing/dashes preserved' },
                    passcode:            { type: ['string', 'null'] },
                    audienceRestriction: { type: ['string', 'null'], description: 'e.g. "CFTs & Above Only", null if open to all' },
                    partnerBrand:        { type: ['string', 'null'], description: 'e.g. "Tevah", "Allianz", "Corebridge", null if no partner' },
                    targetRegion:        { type: ['string', 'null'], description: 'e.g. "Canada", "Puerto Rico", null if general' },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_event' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `Extract structured event data from this flyer (filename: ${fileName}).` },
          ],
        },
      ],
    })

    const toolUse = message.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('No tool_use block in response')
    }

    const input = toolUse.input as { events: ParsedEvent[] }

    // Sonnet 4.5 pricing: $3/M input, $15/M output
    const inputTokens = message.usage.input_tokens
    const outputTokens = message.usage.output_tokens
    const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

    return {
      fileName,
      events: input.events,
      inputTokens,
      outputTokens,
      costUsd,
    }
  } catch (err) {
    return {
      fileName,
      events: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function run() {
  const apiKey = await loadAnthropicKey()
  const client = new Anthropic({ apiKey })

  // Find all image files in the folder
  const files = readdirSync(FOLDER)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()

  console.log(`\nFound ${files.length} image files in ${FOLDER}\n`)
  console.log('Parsing with Claude vision...\n')
  console.log('─'.repeat(80))

  const results: ParseResult[] = []
  let totalCost = 0

  for (const fileName of files) {
    const filePath = join(FOLDER, fileName)
    const stats = statSync(filePath)
    if (stats.size > 20 * 1024 * 1024) {
      console.log(`\n⚠ ${fileName} is ${(stats.size / 1024 / 1024).toFixed(1)} MB — skipping (over 20 MB limit)`)
      continue
    }

    const bytes = readFileSync(filePath)
    process.stdout.write(`\nParsing ${fileName} (${(stats.size / 1024).toFixed(0)} KB)... `)

    const result = await parseImage(client, fileName, bytes)
    results.push(result)
    totalCost += result.costUsd

    if (result.error) {
      console.log(`✗ ${result.error}`)
    } else {
      console.log(`✓ ${result.events.length} event(s) · $${result.costUsd.toFixed(4)}`)
      for (const ev of result.events) {
        console.log(`    • ${ev.title}${ev.subtitle ? ` — ${ev.subtitle}` : ''}`)
        console.log(`      ${ev.category ?? '(no category)'} · ${ev.startsAtET} · ${ev.durationMinutes}min`)
        console.log(`      ${ev.presenters.length} presenter(s): ${ev.presenters.map(p => p.name).join(', ')}`)
        console.log(`      ${ev.streamType}${ev.streamRoomName ? ` (${ev.streamRoomName})` : ''} · ID ${ev.streamId ?? '—'} · pw ${ev.passcode ?? '—'}`)
        if (ev.audienceRestriction) console.log(`      🔒 ${ev.audienceRestriction}`)
        if (ev.targetRegion) console.log(`      🌍 ${ev.targetRegion}`)
        if (ev.partnerBrand) console.log(`      🤝 ${ev.partnerBrand}`)
      }
    }
  }

  console.log('\n' + '─'.repeat(80))
  console.log(`\nDone. ${results.length} files parsed.`)
  console.log(`Total events extracted: ${results.reduce((s, r) => s + r.events.length, 0)}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  const errors = results.filter(r => r.error)
  if (errors.length > 0) {
    console.log(`\n⚠ ${errors.length} parse error(s):`)
    for (const e of errors) console.log(`  • ${e.fileName}: ${e.error}`)
  }
  console.log()
}

run().catch(e => { console.error(e); process.exit(1) })
