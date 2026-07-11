import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { collectTeamProfileIds, toStored } from '@/lib/diagnostic/service'
import { toSubjectView, toCoachingListItem } from '@/lib/diagnostic/access'

// The agent portal Diagnostic tab. Returns the agent's own result (subject
// view) plus a coaching list for everyone in their downline / trainees who has
// completed the diagnostic. The list is the COACHING tier only: score, class,
// and top gap. Sensitive fields (risk, probabilities, consistency, answers)
// never leave the vault.

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error
  const myProfileId = id.profileId

  // Own most recent completed result.
  const mineRow = await db.diagnosticResult.findFirst({
    where: { subjectProfileId: myProfileId, status: 'COMPLETED' },
    orderBy: { submittedAt: 'desc' },
  })
  const mine = mineRow ? toSubjectView(toStored(mineRow as never)) : null

  // Team results (coaching view). One row per team member (their latest).
  const teamIds = await collectTeamProfileIds(myProfileId)
  let team: ReturnType<typeof toCoachingListItem>[] = []
  if (teamIds.size) {
    const rows = await db.diagnosticResult.findMany({
      where: { subjectProfileId: { in: [...teamIds] }, status: 'COMPLETED' },
      orderBy: { submittedAt: 'desc' },
    })
    const seen = new Set<string>()
    for (const r of rows) {
      const key = r.subjectProfileId as string
      if (seen.has(key)) continue // keep only the latest per member
      seen.add(key)
      team.push(toCoachingListItem(toStored(r as never)))
    }
    team = team.sort((a, b) => a.overallScore - b.overallScore) // weakest first, so coaching attention sorts to the top
  }

  return NextResponse.json({ mine, team })
}
