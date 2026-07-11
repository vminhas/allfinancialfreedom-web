import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { loadStored } from '@/lib/diagnostic/service'
import { toVaultView } from '@/lib/diagnostic/access'

// Full per-result report for the vault (admin + LC). Everything: risk, the
// four probability indicators, the consistency / integrity check, attribution,
// and full contact detail.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const stored = await loadStored(id)
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ result: toVaultView(stored) })
}
