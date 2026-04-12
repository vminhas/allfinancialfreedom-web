import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pipelineId = await getSetting('GHL_PIPELINE_ID')
  if (!pipelineId) return NextResponse.json({ notConfigured: true })

  // Count contacts per outreach status from local DB
  const [pending, sent, responded, optedOut] = await Promise.all([
    db.contact.count({ where: { outreachStatus: 'pending' } }),
    db.contact.count({ where: { outreachStatus: 'sent' } }),
    db.contact.count({ where: { outreachStatus: 'responded' } }),
    db.contact.count({ where: { outreachStatus: 'opted-out' } }),
  ])

  // Sample contacts for preview chips
  const [pendingContacts, sentContacts, respondedContacts] = await Promise.all([
    db.contact.findMany({ where: { outreachStatus: 'pending' }, take: 4, select: { firstName: true, lastName: true, email: true } }),
    db.contact.findMany({ where: { outreachStatus: 'sent' }, take: 4, select: { firstName: true, lastName: true, email: true } }),
    db.contact.findMany({ where: { outreachStatus: 'responded' }, take: 4, select: { firstName: true, lastName: true, email: true } }),
  ])

  const toChips = (contacts: { firstName: string; lastName: string; email: string }[]) =>
    contacts.map(c => ({ name: `${c.firstName} ${c.lastName}`, email: c.email }))

  const stages = [
    { id: 'local-1', name: 'Application Received', count: pending, contacts: toChips(pendingContacts), local: true },
    { id: 'local-2', name: 'Contacted', count: sent, contacts: toChips(sentContacts), local: true },
    { id: 'local-3', name: 'Responded', count: responded, contacts: toChips(respondedContacts), local: true },
    { id: 'local-4', name: 'Discovery Booked', count: 0, contacts: [], local: false },
    { id: 'local-5', name: 'Not Responding', count: 0, contacts: [], local: false },
    { id: 'local-6', name: 'Not Interested', count: optedOut, contacts: [], local: true },
    { id: 'local-7', name: 'Qualified', count: 0, contacts: [], local: false },
    { id: 'local-8', name: 'Ready to Onboard', count: 0, contacts: [], local: false },
  ]

  return NextResponse.json({ stages, localOnly: true })
}
