import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { getSetting } from './settings'

const MODEL_ID = 'claude-sonnet-4-5-20250929'

// Anthropic vision caps source images at 5 MB base64. base64 inflates raw
// bytes by ~1.37x (4/3 + line breaks). Working backwards: 5 MB / 1.37 ≈ 3.6 MB
// raw is the absolute ceiling. We target 2 MB raw to leave a wide safety
// margin — anything larger gets resized + recompressed via sharp.
const MAX_RAW_BYTES = 2 * 1024 * 1024

/**
 * If the image is over the 2 MB budget, downscale it. Returns the original
 * buffer + mimeType if it's already under the limit, or a freshly compressed
 * JPEG buffer if it had to shrink. Defensively wrapped so that a sharp
 * failure surfaces a useful error instead of leaking a too-large buffer
 * through to the Claude API.
 */
async function shrinkIfNeeded(
  buffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png'
): Promise<{ buffer: Buffer; mimeType: 'image/jpeg' | 'image/png' }> {
  if (buffer.byteLength <= MAX_RAW_BYTES) {
    return { buffer, mimeType }
  }

  try {
    // Walk down the size ladder until we fit. JPEG quality 85 + max 1600px wide
    // is plenty of resolution for OCR — Claude vision reads dense flyer text
    // without trouble at that size.
    const widths = [1600, 1280, 1024, 800]
    for (const width of widths) {
      const out = await sharp(buffer, { failOn: 'none' })
        .rotate()        // honour EXIF orientation
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer()
      if (out.byteLength <= MAX_RAW_BYTES) {
        return { buffer: out, mimeType: 'image/jpeg' }
      }
    }

    // Last resort — aggressive crunch
    const out = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer()
    return { buffer: out, mimeType: 'image/jpeg' }
  } catch (err) {
    throw new Error(
      `Image shrink failed (raw ${buffer.byteLength} bytes, ${mimeType}): ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

function buildSystemPrompt(): string {
  // Evaluated per request in Eastern time (not once at module load in UTC),
  // so "today" is never stale on a long-lived serverless instance.
  const todayET = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date())
  return `You are an extraction system for GFI / All Financial Freedom training event flyers.

Each image is a single training event flyer from GFI (Global Financial Impact). Layouts are consistent:
- Title (large) — sometimes with a smaller subtitle below
- Optional category banner (e.g. "Technology Tuesday", "Wednesday Workshop", "Inspirational Marketing")
- 1, 2, or 3 presenter portraits with name + role beneath each
- Date in the format "DAY | MONTH DAY, YEAR" (e.g. "MONDAY | APRIL 13, 2026")
- Time across multiple time zones (HST | PST | MST | CST | EST/ET) — always extract the EST/EDT time as the canonical
- Time may use periods instead of colons (e.g. "08.00 PM EST" means 8:00 PM EST)
- Stream platform: usually "GFI Live - Impact TV" with a numeric stream ID and passcode, OR a regular Zoom meeting with Meeting ID + passcode
- Sometimes a partner brand logo (Tevah, Allianz, Corebridge, F&G, Quantum, American Equity, Ethos, etc.)
- Sometimes an audience restriction (e.g. "CFTs & Above Only", "For MD's & Above & Operations Staff Only")
- Sometimes country/region targeting (e.g. "for Canada", "Puerto Rico Launch")

CRITICAL RULES:
1. The time MUST come from the text printed on the flyer (e.g. "08.00 PM EST"), NOT from any metadata or the time the image was sent. If the flyer says "08.00 PM EST", the event is at 8:00 PM Eastern, period.
2. DAY OF WEEK: Always set "dayOfWeekET" to the weekday this event occurs on, and set "hasExplicitDate" accordingly:
   - If the flyer prints an explicit calendar date (e.g. "MONDAY | APRIL 13, 2026"): set hasExplicitDate=true, dayOfWeekET to that day's name, and startsAtET to that exact date/time.
   - If the flyer does NOT print a date and the day is implied by the title/schedule (e.g. "Systems & Mindset Mondays", "EVERY TUESDAY"): set hasExplicitDate=false and dayOfWeekET to that weekday. Do NOT try to calculate the calendar date yourself — the server computes the exact next-occurrence date from dayOfWeekET. Still put your best-guess date in startsAtET, but getting the WEEKDAY right is what matters.
3. Today's date for reference (Eastern time): ${todayET}
4. RECURRENCE: If the flyer clearly states the event repeats every weekday (e.g. "MONDAY - FRIDAY", "MON-FRI", "Monday through Friday", "every weekday", "daily"), set recurrence to "WEEKDAYS". Otherwise set recurrence to null (a one-time event, or a single weekly day, is NOT weekdays). For a WEEKDAYS event, set startsAtET to the next upcoming weekday at the flyer's ET time (today if it is a weekday and the time has not passed yet, otherwise the next weekday).

Extract via the submit_event tool. If a field isn't visible, set it to null. For times, return ISO 8601 with the ET offset (use -04:00 for EDT or -05:00 for EST based on the date).

If the image clearly contains MULTIPLE events on one poster (a weekly schedule), return events as an array. Most flyers will return a single-element array.`
}

export interface ParsedTrainingPresenter {
  name: string
  role: string
}

export interface ParsedTrainingEvent {
  title: string
  subtitle: string | null
  category: string | null
  startsAtET: string                 // ISO 8601 with -04:00 / -05:00 offset
  // Weekday the flyer names for this occurrence ("Tuesday"). The server uses
  // this (not the model's date arithmetic) to compute the exact date for
  // weekday-only flyers. Null when not determinable.
  dayOfWeekET?: string | null
  // True only when the flyer prints an explicit calendar date. When false,
  // the server recomputes the date from dayOfWeekET.
  hasExplicitDate?: boolean
  durationMinutes: number
  presenters: ParsedTrainingPresenter[]
  streamType: 'GFI_LIVE' | 'ZOOM'
  streamRoomName: string | null
  streamId: string | null
  passcode: string | null
  audienceRestriction: string | null
  partnerBrand: string | null
  targetRegion: string | null
  // 'WEEKDAYS' when the flyer says it repeats Mon-Fri; null/absent otherwise.
  // Only the Discord-paste parse-image flow acts on this (creates an ongoing
  // series); the Drive auto-sync ignores it and keeps making one-offs.
  recurrence?: 'WEEKDAYS' | null
}

export interface ParseTrainingResult {
  events: ParsedTrainingEvent[]
  modelId: string
  inputTokens: number
  outputTokens: number
  rawJson: unknown
}

/**
 * Run Claude vision against a single training flyer image and return
 * the structured event data. Reads ANTHROPIC_API_KEY from the encrypted
 * settings table (or env override).
 */
export async function parseTrainingFlyer(params: {
  imageBytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  fileName: string
}): Promise<ParseTrainingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || (await getSetting('ANTHROPIC_API_KEY'))
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  // Auto-shrink oversized flyers (Anthropic vision caps at 5 MB base64).
  // Several GFI flyers are 10-17 MB raw — we transparently resize + recompress.
  const { buffer: shrunkBuffer, mimeType: finalMime } = await shrinkIfNeeded(params.imageBytes, params.mimeType)

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    system: buildSystemPrompt(),
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
                  category:            { type: ['string', 'null'], description: 'Category banner like "Technology Tuesday"' },
                  startsAtET:          { type: 'string', description: 'ISO 8601 datetime with -04:00 or -05:00 offset (parsed from the EST/EDT line). Use the correct ET time; the server recomputes the exact DATE from dayOfWeekET for weekday-only flyers.' },
                  dayOfWeekET:         { type: ['string', 'null'], enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', null], description: 'The day of week THIS event occurs on, read from the flyer: from the printed date\'s day name, or implied by the title/schedule (e.g. "EVERY TUESDAY" -> "Tuesday"). Always set when determinable.' },
                  hasExplicitDate:     { type: 'boolean', description: 'true ONLY if the flyer prints an explicit calendar date (e.g. "MONDAY | APRIL 13, 2026"). false if the day is implied by the title/schedule with no printed date.' },
                  durationMinutes:     { type: 'integer', description: 'Default 60 if not visible' },
                  presenters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['name', 'role'],
                      properties: {
                        name: { type: 'string' },
                        role: { type: 'string', description: 'Title + company if visible (e.g. "CTO of GFI")' },
                      },
                    },
                  },
                  streamType:          { type: 'string', enum: ['GFI_LIVE', 'ZOOM'] },
                  streamRoomName:      { type: ['string', 'null'], description: 'e.g. "GFI Live - Impact TV"' },
                  streamId:            { type: ['string', 'null'], description: 'Stream/meeting ID with original spacing/dashes preserved' },
                  passcode:            { type: ['string', 'null'] },
                  audienceRestriction: { type: ['string', 'null'] },
                  partnerBrand:        { type: ['string', 'null'] },
                  targetRegion:        { type: ['string', 'null'] },
                  recurrence:          { type: ['string', 'null'], enum: ['WEEKDAYS', null], description: 'Set to "WEEKDAYS" ONLY if the flyer says it repeats Monday through Friday / every weekday / daily. Otherwise null.' },
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
          { type: 'image', source: { type: 'base64', media_type: finalMime, data: shrunkBuffer.toString('base64') } },
          { type: 'text', text: `Extract structured event data from this flyer (filename: ${params.fileName}).` },
        ],
      },
    ],
  })

  const toolUse = message.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block')
  }

  const input = toolUse.input as { events: ParsedTrainingEvent[] }

  return {
    events: input.events,
    modelId: MODEL_ID,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    rawJson: input,
  }
}
