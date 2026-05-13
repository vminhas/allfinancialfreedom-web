import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/vault/recruits — list ICA submissions (newest first).
// Query param: status (defaults to PENDING). Admin-only because the
// parsed PDF contains PII (DOB, address, spouse name).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const status = statusParam === 'APPROVED' || statusParam === 'REJECTED' || statusParam === 'PARSE_FAILED'
    ? statusParam
    : 'PENDING'

  const submissions = await db.icaSubmission.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // Resolve recruiter names for the UI without a join. recruiterId is
  // an agentCode, so we batch a single in-clause query.
  const refCodes = Array.from(new Set(submissions.map(s => s.referenceCode).filter((c): c is string => !!c)))
  const recruiters = refCodes.length === 0
    ? []
    : await db.agentProfile.findMany({
        where: { agentCode: { in: refCodes } },
        select: { agentCode: true, firstName: true, lastName: true },
      })
  const recruiterByCode = new Map(recruiters.map(r => [r.agentCode, `${r.firstName} ${r.lastName}`.trim()]))

  return NextResponse.json({
    submissions: submissions.map(s => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      sourceType: s.sourceType,
      sourceAttachmentUrl: s.sourceAttachmentUrl,
      pdfFilename: s.pdfFilename,
      parseError: s.parseError,
      firstName: s.firstName,
      middleName: s.middleName,
      lastName: s.lastName,
      email: s.email,
      dob: s.dob?.toISOString().slice(0, 10) ?? null,
      gender: s.gender,
      maritalStatus: s.maritalStatus,
      spouseName: s.spouseName,
      addressLine1: s.addressLine1,
      city: s.city,
      state: s.state,
      zip: s.zip,
      country: s.country,
      referenceCode: s.referenceCode,
      classification: s.classification,
      hasLicense: s.hasLicense,
      recruiterName: s.referenceCode ? (recruiterByCode.get(s.referenceCode) ?? null) : null,
      createdAgentProfileId: s.createdAgentProfileId,
    })),
  })
}
