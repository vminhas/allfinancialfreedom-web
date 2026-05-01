import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBookingLinks } from '@/lib/booking-links'

// Agents see the curated booking list as read-only.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const links = await getBookingLinks()
  return NextResponse.json({ links })
}
