// Stub for the future GoHighLevel renewal-task handoff. Today the LC manually
// fires reminders via /vault/renewals and we don't write anything to GHL. When
// you're ready to flip this on:
//   1. Replace the body with a ghlPost('/tasks/', { ... }) using src/lib/ghl.ts
//   2. Set GHL_RENEWAL_TASKS_ENABLED=true in env so the call sites stop being no-ops
// Until then, log so it's obvious in Vercel logs which submissions would have
// pushed and we can audit before flipping the flag.

interface RenewalTaskInput {
  submissionId: string
  agentName: string
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  carrier: string
  policyNumber: string | null
  daysUntilAnniversary: number
  nextAnniversary: Date
}

export async function createGhlRenewalTask(input: RenewalTaskInput): Promise<void> {
  if (process.env.GHL_RENEWAL_TASKS_ENABLED !== 'true') {
    console.log('[ghl-renewals] (stub) would create task for', {
      submissionId: input.submissionId,
      client: input.clientName,
      daysUntil: input.daysUntilAnniversary,
    })
    return
  }
  // TODO: wire ghlPost('/tasks/', { ... }) here. Left intentionally empty so
  // the no-op path is the default.
}
