import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

const VALID_TOPICS = [
  'SCHEDULE_EXAM',
  'PASS_POST_LICENSING',
  'FINGERPRINTS_APPLY',
  'GFI_APPOINTMENTS',
  'CE_COURSES',
  'EO_INSURANCE',
  'DIRECT_DEPOSIT',
  'UNDERWRITING',
  'GENERAL',
] as const
type LicensingRequestTopic = typeof VALID_TOPICS[number]

// GET /api/agents/coordinator-requests?phaseItemKey=xxx
// Returns the logged-in agent's own requests. If phaseItemKey is given, only
// those tied to that checklist item.
export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const { searchParams } = new URL(req.url)
  const phaseItemKey = searchParams.get('phaseItemKey')

  const requests = await db.coordinatorRequest.findMany({
    where: {
      agentProfileId: id.profileId,
      ...(phaseItemKey ? { phaseItemKey } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  return NextResponse.json({ requests })
}

// POST /api/agents/coordinator-requests
// Body: { phaseItemKey?, topic, message }
//
// Accepts both real agent sessions and admin/LC preview tokens (so an admin
// using "view as agent" can re-create a deleted request on behalf of an
// agent without bouncing out to a separate vault endpoint).
export async function POST(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const body = await req.json() as {
    phaseItemKey?: string | null
    topic: string
    message: string
  }

  if (!body.topic || !VALID_TOPICS.includes(body.topic as LicensingRequestTopic)) {
    return NextResponse.json({ error: 'Invalid topic' }, { status: 400 })
  }
  if (!body.message || body.message.trim().length < 10) {
    return NextResponse.json({ error: 'Message must be at least 10 characters' }, { status: 400 })
  }

  const request = await db.coordinatorRequest.create({
    data: {
      agentProfileId: id.profileId,
      phaseItemKey: body.phaseItemKey ?? null,
      topic: body.topic as LicensingRequestTopic,
      message: body.message.trim(),
    },
    select: {
      id: true,
      phaseItemKey: true,
      topic: true,
      message: true,
      status: true,
      resolutionNote: true,
      createdAt: true,
      resolvedAt: true,
    },
  })

  // Admin-channel ping so the LC queue sees it land without polling.
  // Fire-and-forget; a Discord outage shouldn't block the response.
  ;(async () => {
    const profile = await db.agentProfile.findUnique({
      where: { id: id.profileId },
      select: { firstName: true, lastName: true, agentCode: true },
    })
    if (!profile) return
    const { pingTicketCreated } = await import('@/lib/coordinator-discord')
    await pingTicketCreated({
      requestId: request.id,
      agent: profile,
      topic: request.topic,
      message: request.message,
    })
  })().catch(err => console.warn('[coordinator-requests POST] admin ping failed:', err))

  return NextResponse.json({ request })
}
