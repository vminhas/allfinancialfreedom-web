import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'
import { loadStored } from '@/lib/diagnostic/service'
import { toSubjectView, toCoachingView } from '@/lib/diagnostic/access'

// A single result inside the agent portal. The agent sees:
//   - the SUBJECT view if it is their own result
//   - the COACHING view if the subject is in their downline / a trainee
//   - 403 otherwise
// This is the drill-in behind the Diagnostic team list.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error
  const myProfileId = identity.profileId

  const { id } = await params
  const stored = await loadStored(id)
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Own result.
  if (stored.subjectProfileId && stored.subjectProfileId === myProfileId) {
    return NextResponse.json({ tier: 'subject', result: toSubjectView(stored) })
  }

  // Team member? Need the subject's agentCode to run the upline/trainer check.
  if (stored.subjectProfileId) {
    const subject = await db.agentProfile.findUnique({
      where: { id: stored.subjectProfileId },
      select: { agentCode: true },
    })
    if (subject?.agentCode) {
      const allowed = await authorizeTeamMemberAccess(myProfileId, subject.agentCode)
      if (allowed) return NextResponse.json({ tier: 'coaching', result: toCoachingView(stored) })
    }
  }

  return NextResponse.json({ error: 'Not authorized to view this result' }, { status: 403 })
}
