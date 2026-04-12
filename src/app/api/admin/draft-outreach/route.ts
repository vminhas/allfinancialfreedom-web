import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSetting } from '@/lib/settings'
import Anthropic from '@anthropic-ai/sdk'

interface ContactInput {
  id: string
  firstName: string
  lastName: string
  licenseType?: string
  currentAgency?: string
  state?: string
  wornOut?: boolean
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { context, contacts } = await req.json() as { context: string; contacts: ContactInput[] }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 })
  }

  const apiKey = await getSetting('ANTHROPIC_API_KEY')
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })

  const prophogBookingUrl = await getSetting('GHL_PROPHOG_BOOKING_URL') || ''

  const client = new Anthropic({ apiKey })

  const SYSTEM_PROMPT = `You are a professional email copywriter for All Financial Freedom (AFF), a financial services company that recruits licensed insurance agents. AFF is led by Vick Minhas (CEO, 16 years experience) and has a mission to close the wealth gap through financial education.

You write outreach emails that:
- Feel personal, warm, and respectful — never salesy or pushy
- Open with something specific to the recipient (their license type, state, or agency if available)
- Briefly explain what AFF offers: higher income potential, full-time or part-time flexibility, mission-driven culture, strong leadership support
- Have a single clear call to action: schedule a 15-minute discovery call${prophogBookingUrl ? ` (use this link: ${prophogBookingUrl})` : ''}
- Are concise — 3 short paragraphs max
- Never use spam trigger words (free, guarantee, limited time, act now, urgent, exclusive offer, winner)
- Never use em dashes (—) — use commas or colons instead
- Use plain, human language — not corporate jargon
- For worn-out leads: skip the pitch entirely. Lead with value (a helpful insight or question) before any mention of AFF. Do NOT include the booking link in the first email to worn-out leads.

Output JSON only: { "subject": "...", "body": "..." }
The body should be plain text (no HTML, no markdown). Keep it under 200 words.`

  const drafts = []

  for (const contact of contacts) {
    const userMessage = `Context about this batch of contacts:
${context || 'No specific context provided.'}

This specific contact:
- Name: ${contact.firstName} ${contact.lastName}
- License Type: ${contact.licenseType || 'Unknown'}
- Current Agency: ${contact.currentAgency || 'Unknown'}
- State: ${contact.state || 'Unknown'}
- Worn Out Lead: ${contact.wornOut ? 'Yes (be extra gentle — no pitch in first email)' : 'No'}

Write a personalized outreach email from Vick Minhas inviting this person to explore joining AFF. Output JSON only.`

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      })

      const raw = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: 'Opportunity with All Financial Freedom', body: raw }

      drafts.push({
        contactId: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        subject: parsed.subject ?? '',
        body: parsed.body ?? '',
      })
    } catch (err) {
      drafts.push({
        contactId: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        subject: '',
        body: `Error drafting: ${String(err)}`,
      })
    }
  }

  return NextResponse.json({ drafts })
}
