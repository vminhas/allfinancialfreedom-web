// Single point of entry for writing audit-log rows on a
// NewBusinessSubmission. Every lifecycle event that's worth showing
// in the drawer's Activity tab routes through this helper:
//   * CREATED          — initial submission landed
//   * SPLIT_ADDED      — split agent set (initial or via edit)
//   * SPLIT_REMOVED    — split agent cleared (set to null)
//   * STATUS_CHANGED   — PENDING → ISSUED, ISSUED → DECLINED, etc.
//   * OTHER            — escape hatch
//
// Best-effort: a logging failure never blocks the underlying mutation.
// Caller should .catch(() => {}) on the returned promise.

import { db } from '@/lib/db'

export type SubmissionActivityKind =
  | 'CREATED'
  | 'SPLIT_ADDED'
  | 'SPLIT_REMOVED'
  | 'STATUS_CHANGED'
  | 'OTHER'

export interface LogActivityArgs {
  submissionId: string
  kind: SubmissionActivityKind
  // Exactly one of the actor IDs should be set (or neither for system).
  actorAgentProfileId?: string | null
  actorAdminId?: string | null
  // Free-form: { from, to, splitAgentName, splitAgentCode, etc. } —
  // inspected client-side to render the human copy.
  meta?: Record<string, unknown>
}

export async function logSubmissionActivity(args: LogActivityArgs): Promise<void> {
  try {
    await db.newBusinessSubmissionActivity.create({
      data: {
        submissionId: args.submissionId,
        kind: args.kind,
        actorAgentProfileId: args.actorAgentProfileId ?? null,
        actorAdminId: args.actorAdminId ?? null,
        metaJson: (args.meta ?? null) as never,
      },
    })
  } catch (err) {
    console.warn('[submission-activity] log failed (non-fatal):', err)
  }
}
