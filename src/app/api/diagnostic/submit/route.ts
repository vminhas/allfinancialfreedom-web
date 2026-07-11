import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validateEmail } from '@/lib/contact-validation'
import { sanitizeName, capStr } from '@/lib/lead-abuse-guard'
import { scoreDiagnostic, validateAnswers, type Answers } from '@/lib/diagnostic/scoring'
import { persistScored } from '@/lib/diagnostic/service'

// Public + agent submission of a completed Success Diagnostic. Scores the
// answers server-side (never trust a client-computed score), persists the
// row, and returns the new id so the caller can view the results page. If an
// agent is signed in, the result is linked to their profile and sourced as
// agent_portal; otherwise it is a public link submission credited to the
// recruiter code carried on the share link.

interface Body {
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  phone?: unknown
  company?: unknown
  state?: unknown
  recruiterCode?: unknown   // agentCode carried on the share link
  recruiterName?: unknown   // free-text "who referred you"
  answers?: unknown
  pageUrl?: unknown
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const firstNameRaw = str(body.firstName)
  const lastNameRaw = str(body.lastName)
  const firstName = firstNameRaw ? sanitizeName(firstNameRaw) : null
  const lastName = lastNameRaw ? sanitizeName(lastNameRaw) : null
  const email = str(body.email) ? capStr(body.email as string, 200) : null
  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: 'Please enter your name and email.' }, { status: 400 })
  }
  const emailErr = validateEmail(email)
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 })

  // Answers: a map of questionKey -> numeric answer. Reject anything not a
  // plain object; validate every item against the question bank.
  const rawAnswers = body.answers
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    return NextResponse.json({ error: 'Missing answers.' }, { status: 400 })
  }
  const answers: Answers = {}
  for (const [k, v] of Object.entries(rawAnswers as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) answers[k] = v
  }
  const missing = validateAnswers(answers)
  if (missing.length) {
    return NextResponse.json({ error: `Please answer every question (${missing.length} remaining).`, missing }, { status: 400 })
  }

  // Identity: if an agent is signed in, link the result to their profile.
  let subjectProfileId: string | null = null
  let source = 'public_link'
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (role === 'agent' && session?.user?.email) {
    const u = await db.agentUser.findFirst({
      where: { email: { equals: session.user.email, mode: 'insensitive' } },
      include: { profile: { select: { id: true } } },
    })
    if (u?.profile?.id) {
      subjectProfileId = u.profile.id
      source = 'agent_portal'
    }
  }

  // Recruiter attribution: normalize + verify the share-link code resolves to
  // a real agent; keep it only when it does so credit is trustworthy.
  let recruiterCode: string | null = null
  const rawCode = str(body.recruiterCode)
  if (rawCode) {
    const found = await db.agentProfile.findUnique({
      where: { agentCode: rawCode.toUpperCase() },
      select: { agentCode: true },
    })
    recruiterCode = found?.agentCode ?? null
  }
  const recruiterName = str(body.recruiterName) ? sanitizeName(body.recruiterName as string) : null

  const scored = scoreDiagnostic(answers)
  const id = await persistScored(
    {
      firstName, lastName, email,
      phone: str(body.phone) ? capStr(body.phone as string, 30) : null,
      company: str(body.company) ? capStr(body.company as string, 200) : null,
      state: str(body.state) ? capStr(body.state as string, 60) : null,
      subjectProfileId,
      recruiterCode,
      recruiterName,
      source,
      answers,
      ipAddress: clientIp(req),
      userAgent: req.headers.get('user-agent') ? capStr(req.headers.get('user-agent')!, 500) : null,
      pageUrl: str(body.pageUrl) ? capStr(body.pageUrl as string, 600) : null,
    },
    scored,
  )

  return NextResponse.json({ ok: true, id })
}
