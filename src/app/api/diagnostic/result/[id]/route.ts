import { NextResponse } from 'next/server'
import { loadStored } from '@/lib/diagnostic/service'
import { toSubjectView } from '@/lib/diagnostic/access'

// The taker's own results page. The row id is an unguessable cuid that acts
// as a capability token (same model as the source tool's emailed results
// link), so anyone with the link sees the SUBJECT view. The subject view
// deliberately omits the sensitive fields (risk label, consistency mechanics,
// raw answers); those are only ever exposed in the vault.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const stored = await loadStored(id)
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ result: toSubjectView(stored) })
}
