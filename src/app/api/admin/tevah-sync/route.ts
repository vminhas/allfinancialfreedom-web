import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncAgents, syncClients } from '@/app/api/cron/tevah-sync/route'

// POST /api/admin/tevah-sync
// Admin-authenticated wrapper around the Tevah sync cron.
// Allows the vault settings page to trigger a manual sync without
// exposing the CRON_SECRET to the frontend.

export async function POST(req: NextRequest) {
  void req
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agents = await syncAgents()
  const clients = await syncClients()

  return NextResponse.json({ ok: true, agents, submissions: clients })
}
