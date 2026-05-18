import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ agentCode: string; partnerId: string }> },
) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const { agentCode, partnerId } = await ctx.params
  const trainee = await authorizeTeamMemberAccess(id.profileId, agentCode)
  if (!trainee) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const partner = await db.businessPartner.findUnique({ where: { id: partnerId } })
  if (!partner || partner.agentProfileId !== trainee.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json() as { trainerNotes?: string }
  const data: Record<string, unknown> = {}
  if (body.trainerNotes !== undefined) data.trainerNotes = body.trainerNotes || null

  const updated = await db.businessPartner.update({ where: { id: partnerId }, data })
  return NextResponse.json({ ok: true, trainerNotes: updated.trainerNotes })
}
