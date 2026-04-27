import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

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

async function getProfileId(email: string) {
  const u = await db.agentUser.findUnique({
    where: { email },
    include: { profile: { select: { id: true } } },
  })
  return u?.profile?.id ?? null
}

// GET /api/agents/coordinator-requests?phaseItemKey=xxx
// Returns the logged-in agent's own requests. If phaseItemKey is given, only
// those tied to that checklist item.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const phaseItemKey = searchParams.get('phaseItemKey')

  const requests = await db.coordinatorRequest.findMany({
    where: {
      agentProfileId: profileId,
      ...(phaseItemKey ? { phaseItemKey } : {}),
    },
    orderBy: { createdAt: 'desc' },
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

  return NextResponse.json({ requests })
}

// POST /api/agents/coordinator-requests
// Body: { phaseItemKey?, topic, message }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

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
      agentProfileId: profileId,
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

  return NextResponse.json({ request })
}
