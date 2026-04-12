import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

interface CsvContact {
  firstName: string
  lastName: string
  email: string
  phone?: string
  licenseType?: string
  currentAgency?: string
  state?: string
  wornOut?: boolean
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fileName, contacts, contextPrompt, wornOutStrategy } = await req.json() as {
    fileName: string
    contacts: CsvContact[]
    contextPrompt?: string
    wornOutStrategy?: string
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 })
  }

  // Check suppression list
  const suppressedEmails = await db.suppressionEntry.findMany({
    where: { email: { in: contacts.map(c => c.email.toLowerCase()) } },
    select: { email: true },
  })
  const suppressedSet = new Set(suppressedEmails.map(s => s.email))

  // Check existing contacts (deduplication)
  const existingContacts = await db.contact.findMany({
    where: { email: { in: contacts.map(c => c.email.toLowerCase()) } },
    select: { email: true },
  })
  const existingSet = new Set(existingContacts.map(c => c.email.toLowerCase()))

  const newContacts = contacts.filter(c => {
    const email = c.email.toLowerCase()
    return !suppressedSet.has(email) && !existingSet.has(email)
  })

  const skippedCount = contacts.length - newContacts.length

  // Create the import job
  const job = await db.importJob.create({
    data: {
      fileName,
      totalRows: contacts.length,
      importedCount: 0,
      skippedCount,
      errorCount: 0,
      status: 'PENDING',
      contextPrompt,
      wornOutStrategy,
    },
  })

  // Bulk create contact records (pre-import, no GHL calls yet)
  if (newContacts.length > 0) {
    await db.contact.createMany({
      data: newContacts.map(c => ({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email.toLowerCase(),
        phone: c.phone,
        licenseType: c.licenseType,
        currentAgency: c.currentAgency,
        state: c.state,
        wornOut: c.wornOut ?? false,
        source: 'prophog',
        importJobId: job.id,
        outreachStatus: 'pending',
      })),
      skipDuplicates: true,
    })
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    total: contacts.length,
    toImport: newContacts.length,
    skipped: skippedCount,
    suppressed: suppressedEmails.length,
    duplicates: existingContacts.length,
  })
}
