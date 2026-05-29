import { db } from '@/lib/db'
import { todayInEt } from '@/lib/renewals'

// The recurring daily SOP steps, seeded once as recurring LcTasks. The
// LC can edit/add/remove tasks after seeding; this only runs when the
// table has no recurring rows yet, so it won't fight her edits.
export const LC_SOP_SEED: string[] = [
  'Review the New Business queue (New + Hold first). Check Tevah for each open application and set "Verified through Tevah" when confirmed.',
  'Add a structured New Business note for each application you touch (Status, Action Taken, Verified through Tevah, Note).',
  'Work the open Licensing requests in your inbox. Add a structured Licensing note (Purpose, Action Taken, Additional Note) for each agent you help.',
  'Process new Breezy HR applicants that came in today.',
  'End of day: confirm every status is current. The daily digest sends automatically at 9pm ET.',
]

// ET calendar day key ("YYYY-MM-DD"). A task is "done today" when its
// completedOn equals this, which is how recurring tasks reset each day.
export function etDayKey(now: Date = new Date()): string {
  return todayInEt(now).toLocaleDateString('en-CA')
}

// Seed the recurring SOP tasks if none exist yet. Idempotent.
export async function ensureLcTasksSeeded(): Promise<void> {
  const count = await db.lcTask.count({ where: { recurring: true } })
  if (count > 0) return
  await db.lcTask.createMany({
    data: LC_SOP_SEED.map((title, i) => ({ title, recurring: true, sortOrder: i })),
  })
}
