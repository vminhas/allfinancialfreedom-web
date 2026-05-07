import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

// Phase + valid item keys for recruitment-style claims. Hard-coded
// because only the direct_1/2/3 items in phase 2 use this flow today;
// keeping the allow-list narrow prevents a stray claim from writing
// linkedAgentProfileId onto a checklist item that was never meant to
// carry one.
const VALID_ITEM_KEYS = new Set(['direct_1', 'direct_2', 'direct_3'])
const RECRUIT_PHASE = 2

// POST /api/agents/recruits/claim
// Body: { itemKey: 'direct_1' | 'direct_2' | 'direct_3', recruitProfileId: string }
//
// Fulfills a recruit-checklist item with an existing AgentProfile.
// Idempotent: claiming the same agent for the same item just refreshes
// the link. Different agent for the same item replaces the prior link.
//
// Side effects:
//   - PhaseItem upsert: completed=true, completedAt=now, linkedAgentProfileId=<recruit>
//   - If the recruit's recruiterId is unset, set it to the caller's agentCode
//   - If the recruit's recruiterId is set to someone else, leave it (warn-and-allow)
//     and ping the admin Discord channel so the conflict gets reviewed
export async function POST(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const body = await req.json() as { itemKey?: string; recruitProfileId?: string }
  const itemKey = typeof body.itemKey === 'string' ? body.itemKey : ''
  const recruitProfileId = typeof body.recruitProfileId === 'string' ? body.recruitProfileId : ''

  if (!VALID_ITEM_KEYS.has(itemKey)) {
    return NextResponse.json({ error: 'Invalid itemKey' }, { status: 400 })
  }
  if (!recruitProfileId) {
    return NextResponse.json({ error: 'recruitProfileId required' }, { status: 400 })
  }

  const me = await db.agentProfile.findUnique({
    where: { id: id.profileId },
    select: { id: true, agentCode: true, firstName: true, lastName: true },
  })
  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (recruitProfileId === me.id) {
    return NextResponse.json({ error: "You can't claim yourself as a recruit" }, { status: 400 })
  }

  const recruit = await db.agentProfile.findUnique({
    where: { id: recruitProfileId },
    select: {
      id: true, firstName: true, lastName: true, agentCode: true,
      status: true, recruiterId: true, isTest: true,
    },
  })
  if (!recruit || recruit.isTest) {
    return NextResponse.json({ error: 'Recruit not found' }, { status: 404 })
  }

  // Block claiming the same recruit twice across direct_1/2/3 — one
  // person can't fill two slots. Idempotent on the same slot is fine
  // (handled by the upsert below).
  const existingClaim = await db.phaseItem.findFirst({
    where: {
      agentProfileId: me.id,
      phase: RECRUIT_PHASE,
      itemKey: { in: [...VALID_ITEM_KEYS], not: itemKey },
      linkedAgentProfileId: recruit.id,
    },
    select: { itemKey: true },
  })
  if (existingClaim) {
    return NextResponse.json({
      error: `${recruit.firstName} ${recruit.lastName} is already claimed on your ${existingClaim.itemKey} item. Pick a different recruit for this slot.`,
    }, { status: 409 })
  }

  const now = new Date()
  await db.phaseItem.upsert({
    where: {
      agentProfileId_phase_itemKey: {
        agentProfileId: me.id,
        phase: RECRUIT_PHASE,
        itemKey,
      },
    },
    update: {
      completed: true,
      completedAt: now,
      linkedAgentProfileId: recruit.id,
    },
    create: {
      agentProfileId: me.id,
      phase: RECRUIT_PHASE,
      itemKey,
      completed: true,
      completedAt: now,
      linkedAgentProfileId: recruit.id,
    },
  })

  // Recruiter linkage. We only set it when blank (don't silently
  // overwrite). Conflicts get a Discord ping so an admin can decide.
  let conflict: { existingRecruiterCode: string } | null = null
  if (!recruit.recruiterId) {
    await db.agentProfile.update({
      where: { id: recruit.id },
      data: { recruiterId: me.agentCode },
    })
  } else if (recruit.recruiterId !== me.agentCode) {
    conflict = { existingRecruiterCode: recruit.recruiterId }
    if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
      try {
        const { sendChannelMessage } = await import('@/lib/discord')
        sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
          embeds: [{
            title: '⚠️ Recruiter conflict on a recruit-checklist claim',
            description: `**${me.firstName} ${me.lastName} (${me.agentCode})** claimed **${recruit.firstName} ${recruit.lastName} (${recruit.agentCode})** as their recruit on \`${itemKey}\`, but ${recruit.firstName}'s current recruiter on file is **${recruit.recruiterId}**. The phase-item claim landed; the recruiter-id link was NOT changed. Review and reconcile if needed.`,
            color: 0xF59E0B,
            timestamp: new Date().toISOString(),
            footer: { text: 'AFF Concierge · Recruit claims' },
          }],
        }).catch(() => {})
      } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json({
    ok: true,
    itemKey,
    linkedAgentProfileId: recruit.id,
    recruit: {
      id: recruit.id,
      firstName: recruit.firstName,
      lastName: recruit.lastName,
      agentCode: recruit.agentCode,
      status: recruit.status,
    },
    conflict,
  })
}
