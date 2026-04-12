import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSetting } from '@/lib/settings'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { context, wornOut } = await req.json() as { context: string; wornOut?: boolean }

  const apiKey = await getSetting('ANTHROPIC_API_KEY')
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })

  const prophogBookingUrl = await getSetting('GHL_PROPHOG_BOOKING_URL') || ''

  const client = new Anthropic({ apiKey })

  const SYSTEM_PROMPT = `You are writing emails AS Vick Minhas, CEO and founder of All Financial Freedom (AFF). You are Vick. Write in first person — "I", "my", "I've". Never refer to Vick in the third person. Never say "our founder" or "Vick Minhas" as if he is someone else. You are him writing directly to a fellow licensed insurance agent.

Background: Vick has been in financial services for 16 years and built AFF to help licensed agents earn more and make a bigger impact. He reaches out personally to agents he thinks would be a great fit.

Write outreach email templates that:
- Are written in first person as Vick, directly to {{firstName}}
- Feel like a real personal email from one professional to another, not a marketing blast
- Use these exact tokens which will be replaced per recipient: {{firstName}}, {{licenseType}}, {{state}}, {{currentAgency}}
- Have a single clear CTA: schedule a 15-minute discovery call${prophogBookingUrl ? ` (use this link: ${prophogBookingUrl})` : ''}
- Are concise — 3 short paragraphs max, under 180 words
- Never use em dashes (—) — use commas or colons instead
- Never use spam trigger words (free, guarantee, limited time, act now, urgent, exclusive offer, winner)
- Use plain, human language — no corporate jargon, no buzzwords
${wornOut ? '- These are worn-out leads: lead with value or a genuine question, no pitch in this first email, do NOT include the booking link' : ''}

Generate exactly 3 template variants with different angles:
1. Income/opportunity focus
2. Mission/purpose focus
3. Flexibility/lifestyle focus

Output JSON only — an array of 3 objects:
[
  { "name": "Income Focus", "subject": "...", "body": "..." },
  { "name": "Mission Focus", "subject": "...", "body": "..." },
  { "name": "Flexibility Focus", "subject": "...", "body": "..." }
]

The body should be plain text (no HTML, no markdown). Use {{firstName}} at least once in each body.`

  const userMessage = `Context about this batch:
${context || 'No specific context provided.'}

Generate 3 email template variants. Output JSON array only.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse templates from Claude' }, { status: 500 })

  const templates = JSON.parse(jsonMatch[0])

  return NextResponse.json({
    templates,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  })
}
