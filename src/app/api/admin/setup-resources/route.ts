import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const resources = await db.setupResource.findMany({
    orderBy: { category: 'asc' },
  })
  return NextResponse.json({ resources })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as {
    key: string
    label: string
    url: string
    category?: string
    description?: string
  }

  if (!body.key || !body.label || !body.url) {
    return NextResponse.json({ error: 'key, label, url required' }, { status: 400 })
  }

  try {
    const resource = await db.setupResource.create({
      data: {
        key: body.key,
        label: body.label,
        url: body.url,
        category: body.category ?? 'general',
        description: body.description,
      },
    })
    return NextResponse.json(resource)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Key already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    label?: string
    url?: string
    category?: string
    description?: string
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) data.label = body.label
  if (body.url !== undefined) data.url = body.url
  if (body.category !== undefined) data.category = body.category
  if (body.description !== undefined) data.description = body.description

  const resource = await db.setupResource.update({
    where: { id: body.id },
    data,
  })
  return NextResponse.json(resource)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.setupResource.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
