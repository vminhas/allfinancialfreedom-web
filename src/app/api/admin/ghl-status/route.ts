import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGhlConfig, ghlGet } from '@/lib/ghl'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const config = await getGhlConfig()

    if (!config.apiKey || !config.locationId) {
      return NextResponse.json({ connected: false, error: 'API key or Location ID not configured' })
    }

    const res = await ghlGet(`/locations/${config.locationId}`, config)

    if (!res.ok) {
      return NextResponse.json({ connected: false, error: `GHL returned ${res.status}` })
    }

    const data = await res.json()
    const location = data.location ?? data

    // Get contact count
    const countRes = await ghlGet(
      `/contacts/?locationId=${config.locationId}&limit=1`,
      config
    )
    const countData = countRes.ok ? await countRes.json() : null

    return NextResponse.json({
      connected: true,
      locationName: location.name ?? location.business?.name ?? 'Connected',
      contactCount: countData?.meta?.total ?? countData?.total ?? null,
    })
  } catch (err) {
    return NextResponse.json({ connected: false, error: String(err) })
  }
}
