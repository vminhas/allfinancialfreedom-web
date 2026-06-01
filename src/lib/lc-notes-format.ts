// Standardized note strings for the Licensing Coordinator SOP.
//
// Pure formatting, no I/O. Imported by the New Business notes route, the
// Licensing notes route, and the daily digest cron so the exact wording
// lives in ONE place and never drifts between surfaces.
//
// Per CLAUDE.md: NO em-dashes in any output here (these strings are
// user-visible in notes, Discord, and email).

import type { NewBusinessStatus } from '@/generated/prisma/client'
import { lcPurposeLabel } from '@/lib/licensing-topics'

// SOP status vocabulary. The guide uses "New / Pending / Hold / Issued";
// our enum has no NEW (the initial state is PENDING), so PENDING renders
// as "New" to match the LC's language.
const STATUS_LABEL: Record<NewBusinessStatus, string> = {
  PENDING: 'New',
  PENDING_CARRIER: 'Pending',
  HOLD: 'Hold',
  ISSUED: 'Issued',
  CONDITIONALLY_ISSUED: 'Conditionally Issued',
  DECLINED: 'Declined',
  LAPSED: 'Lapsed',
  NOT_TAKEN: 'Not Taken',
}

export function statusLabel(status: NewBusinessStatus): string {
  return STATUS_LABEL[status] ?? String(status)
}

// The structured New Business note body stored on the submission.
export function formatNewBusinessNoteBody(args: {
  actionTaken?: string | null
  tevahVerified: boolean
  note?: string | null
}): string {
  const action = (args.actionTaken ?? '').trim() || 'None'
  const note = (args.note ?? '').trim() || 'None'
  return [
    `Action Taken: ${action}`,
    `Verified Through Tevah: ${args.tevahVerified ? 'Yes' : 'No'}`,
    `Note: ${note}`,
  ].join('\n')
}

// The structured Licensing note body stored on the agent.
export function formatLicensingNoteBody(args: {
  purpose?: string | null
  actionTaken?: string | null
  additionalNote?: string | null
}): string {
  const purpose = lcPurposeLabel(args.purpose) || 'Other'
  const action = (args.actionTaken ?? '').trim() || 'None'
  const additional = (args.additionalNote ?? '').trim() || 'None'
  return [
    `Purpose: ${purpose}`,
    `Action Taken: ${action}`,
    `Additional Note: ${additional}`,
  ].join('\n')
}

// The standardized one-liner mirrored onto the agent's licensing record
// whenever the LC works a New Business application. First note on a
// submission announces it; later notes report an update.
export function buildLicensingMirrorNote(args: {
  isFirstNote: boolean
  policyTypeLabel: string
  clientName: string
  carrier: string
  statusLabel: string
}): string {
  const { policyTypeLabel, clientName, carrier, statusLabel } = args
  if (args.isFirstNote) {
    return `NEW BUSINESS SUBMITTED: ${policyTypeLabel} for ${clientName} with ${carrier}, Current Status: ${statusLabel}`
  }
  return `NEW BUSINESS NOTE: For ${clientName} with ${carrier} (${policyTypeLabel}): Notes Updated; Current Status: ${statusLabel}`
}
