import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGhlConfig, ghlGet } from '@/lib/ghl'
import { setSetting } from '@/lib/settings'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getGhlConfig()
  const res = await ghlGet(`/opportunities/pipelines?locationId=${config.locationId}`, config)
  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }
  const data = await res.json()
  return NextResponse.json({ pipelines: data.pipelines ?? [] })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pipelineId } = await req.json()
  if (!pipelineId) return NextResponse.json({ error: 'pipelineId required' }, { status: 400 })

  const config = await getGhlConfig()
  const res = await ghlGet(`/opportunities/pipelines/${pipelineId}?locationId=${config.locationId}`, config)
  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json()
  const pipeline = data.pipeline ?? data
  await setSetting('GHL_PIPELINE_ID', pipeline.id)

  for (const stage of pipeline.stages ?? []) {
    const key = `GHL_STAGE_${stage.name.replace(/\s+/g, '_').toUpperCase()}`
    await setSetting(key, stage.id)
  }

  return NextResponse.json({ ok: true, pipelineId: pipeline.id, stages: pipeline.stages ?? [] })
}
