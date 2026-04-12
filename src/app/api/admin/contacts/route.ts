import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const outreachStatus = searchParams.get('outreachStatus')
  const wornOut = searchParams.get('wornOut')
  const licenseType = searchParams.get('licenseType')
  const importJobId = searchParams.get('importJobId')
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  const where: Record<string, unknown> = {}
  if (outreachStatus) where.outreachStatus = outreachStatus
  if (wornOut !== null) where.wornOut = wornOut === 'true'
  if (licenseType) where.licenseType = licenseType
  if (importJobId) where.importJobId = importJobId

  const [contacts, total] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        licenseType: true,
        currentAgency: true,
        state: true,
        wornOut: true,
        outreachStatus: true,
        ghlContactId: true,
        importJobId: true,
        createdAt: true,
      },
    }),
    db.contact.count({ where }),
  ])

  return NextResponse.json({ contacts, total, page, limit })
}
