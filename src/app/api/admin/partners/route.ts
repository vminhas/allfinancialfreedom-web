import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { autoLinkAgentForBusinessPartner } from '@/lib/business-partner-link'

// POST /api/admin/partners
//
// Admin-side hand-off: take a lead Vick or another leader met out in the
// world and assign it to a specific producing agent's Business Partner
// list. The agent then sees it in their portal exactly as if they'd
// added it themselves. Source is stamped 'admin_handoff' for analytics
// so we can later answer "how many partners came from CEO leads?"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as {
    agentProfileId: string
    name: string
    email?: string
    phone?: string
    timeZone?: string
    age?: string
    married?: boolean
    children?: boolean
    homeowner?: boolean
    occupation?: string
    characterTraits?: string
    category?: string
    appointmentDate?: string
    firstCallDate?: string
    secondCallDate?: string
    bookedAppt?: boolean
    notes?: string
  }

  if (!body.agentProfileId) {
    return NextResponse.json({ error: 'agentProfileId required' }, { status: 400 })
  }
  if (!body.name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  // Confirm the target agent exists and is active before writing. A typo'd
  // id otherwise creates an orphan-shaped row that the agent will never
  // see; better to 404 the admin so they can correct it.
  const agent = await db.agentProfile.findUnique({
    where: { id: body.agentProfileId },
    select: { id: true, status: true },
  })
  if (!agent || agent.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Target agent not found or inactive' }, { status: 404 })
  }

  const partner = await db.businessPartner.create({
    data: {
      agentProfileId: agent.id,
      name: body.name,
      email: body.email,
      phone: body.phone,
      timeZone: body.timeZone,
      age: body.age,
      married: body.married ?? false,
      children: body.children ?? false,
      homeowner: body.homeowner ?? false,
      occupation: body.occupation,
      characterTraits: body.characterTraits,
      category: body.category,
      appointmentDate: body.appointmentDate ? new Date(body.appointmentDate) : null,
      firstCallDate: body.firstCallDate ? new Date(body.firstCallDate) : null,
      secondCallDate: body.secondCallDate ? new Date(body.secondCallDate) : null,
      bookedAppt: body.bookedAppt ?? false,
      notes: body.notes,
      source: 'admin_handoff',
      // Imports land in PENDING; admin hand-offs land already classified
      // because the admin picks a category. If they didn't pick one, fall
      // back to PENDING so it shows up in the receiving agent's queue.
      status: body.category ? 'NEW' : 'PENDING',
    },
  })

  // Hand-offs from leadership often involve someone who's already a
  // licensed AFF agent (warm intro to a colleague, etc.); link the BP
  // to that AgentProfile if the email matches.
  if (partner.email) {
    await autoLinkAgentForBusinessPartner({ businessPartnerId: partner.id, email: partner.email })
  }

  // Mirror the agent-side classify path: when a BP lands already
  // categorized (status=NEW), fire the #announcements welcome embed
  // celebrating the receiving agent. Vault-side hand-offs used to
  // skip this — meaning policies Vick or other leadership added on
  // behalf of an agent never showed up in the channel.
  if (partner.status === 'NEW') {
    const receivingAgent = await db.agentProfile.findUnique({
      where: { id: agent.id },
      select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true },
    })
    if (receivingAgent) {
      import('@/lib/business-partner-announce')
        .then(({ announceBPWelcome }) =>
          announceBPWelcome({
            agentFirstName: receivingAgent.firstName,
            agentLastName: receivingAgent.lastName,
            agentCode: receivingAgent.agentCode,
            agentAvatarUrl: receivingAgent.avatarUrl,
            bpName: partner.name,
          })
        )
        .catch(err => console.warn('[admin partners] BP announce failed:', err))
    }
  }

  return NextResponse.json(partner)
}

// GET /api/admin/partners/agents
//
// Lightweight roster for the agent picker on the hand-off form. Returns
// only the fields the picker needs (id, agentCode, name, phase) and skips
// inactive + test accounts. Lives on the same route to avoid an extra
// file for what is one read query.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true, agentCode: true, firstName: true, lastName: true, phase: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({ agents })
}
