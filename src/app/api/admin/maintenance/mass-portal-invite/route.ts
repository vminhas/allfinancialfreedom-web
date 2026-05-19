import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { sendAgentInviteEmail } from '@/lib/send-agent-invite'

export const runtime = 'nodejs'
// Mass email send can take a while (GHL round-trip per agent), so give
// it room beyond the default serverless budget.
export const maxDuration = 300

// Eligible = an ACTIVE agent who was invited but never activated the
// portal (no passwordHash = never set a password / never logged in /
// never accepted the invite). Test + synthetic (@aff.local) accounts
// are excluded so we never blast them.
async function findEligible() {
  const profiles = await db.agentProfile.findMany({
    where: {
      status: 'ACTIVE',
      isTest: false,
      agentUser: { is: { passwordHash: null } },
    },
    select: {
      firstName: true,
      lastName: true,
      agentUser: { select: { id: true, email: true } },
    },
  })
  return profiles
    .filter(p =>
      p.agentUser &&
      typeof p.agentUser.email === 'string' &&
      p.agentUser.email.trim().length > 0 &&
      !p.agentUser.email.endsWith('@aff.local'),
    )
    .map(p => ({
      agentUserId: p.agentUser!.id,
      email: p.agentUser!.email,
      name: `${p.firstName} ${p.lastName}`,
    }))
}

// GET — dry run: how many agents a send would email right now.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const eligible = await findEligible()
  return NextResponse.json({ eligible: eligible.length })
}

// POST { confirm: true } — actually (re)send the portal invite email to
// every eligible agent. Each send regenerates a fresh 72h invite token.
// Sequential so we don't hammer the GHL email API; per-agent failures
// are collected and don't abort the run.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as { confirm?: boolean }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true } to send.' }, { status: 400 })
  }

  const eligible = await findEligible()

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const a of eligible) {
    try {
      const res = await sendAgentInviteEmail(a.agentUserId)
      if (res.emailSent) {
        sent++
      } else {
        failed++
        if (errors.length < 20) {
          errors.push(`${a.name} <${a.email}>: ${res.emailError ?? 'not sent'}`)
        }
      }
    } catch (err) {
      failed++
      if (errors.length < 20) {
        errors.push(`${a.name} <${a.email}>: ${err instanceof Error ? err.message : 'error'}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    eligible: eligible.length,
    sent,
    failed,
    errors,
  })
}
