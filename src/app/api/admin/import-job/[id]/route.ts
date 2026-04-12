import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const job = await db.importJob.findUnique({
    where: { id },
    select: { id: true, fileName: true, contextPrompt: true, createdAt: true },
  })

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(job)
}
