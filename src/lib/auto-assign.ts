import { db } from './db'

// Returns the licensing coordinator with the fewest open PENDING submissions.
// Used to auto-assign new PENDING submissions so the LC inbox is never empty.
// Returns null if no LCs exist in the system yet.
export async function getAutoAssignee(): Promise<string | null> {
  const lcs = await db.adminUser.findMany({
    where: { role: 'LICENSING_COORDINATOR' },
    select: {
      id: true,
      _count: {
        select: { assignedSubmissions: { where: { status: 'PENDING' } } },
      },
    },
  })
  if (lcs.length === 0) return null
  lcs.sort((a, b) => a._count.assignedSubmissions - b._count.assignedSubmissions)
  return lcs[0].id
}
