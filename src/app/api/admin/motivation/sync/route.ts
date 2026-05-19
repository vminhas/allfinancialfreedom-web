import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { syncMotivationFromFile } from '@/lib/motivation'

// POST /api/admin/motivation/sync  { confirm: true }
//
// Replaces the entire live motivation library with the reviewable repo
// file (src/data/motivation-library.json). DESTRUCTIVE: overwrites any
// lines that were added or edited only in the vault. Admin only, and it
// requires an explicit confirm so a stray click can't wipe the library.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as { confirm?: boolean }
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: 'Pass { confirm: true } to replace the live library from the file.' },
      { status: 400 },
    )
  }

  const { count } = await syncMotivationFromFile()
  return NextResponse.json({ ok: true, count })
}
