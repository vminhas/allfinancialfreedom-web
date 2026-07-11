import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { toStored } from '@/lib/diagnostic/service'
import { toVaultListItem } from '@/lib/diagnostic/access'

// Vault list of every diagnostic result (admin + LC). Returns the full tier
// list rows (including risk, limiting factor, licensing probability, and
// attribution) so the page can filter, group by category, and export. The
// dataset is modest, so filtering + grouping happen client-side against this
// payload, matching the existing vault list pages (leads, new-business).

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const rows = await db.diagnosticResult.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })
  const items = rows.map(r => toVaultListItem(toStored(r as never)))
  return NextResponse.json({ items, count: items.length })
}
