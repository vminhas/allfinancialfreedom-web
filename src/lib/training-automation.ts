import { getSetting } from './settings'

// Master switch for Concierge's training automation, controlled by a toggle in
// /vault/settings ("Training announcements & scheduling"). OFF by default.
//
// Training (flyer parsing, Discord announcements/reminders, the Drive
// auto-sync, and recurring-series roll-forward) is being handed to Cadre
// (mycadre). While disabled, every training entry point no-ops. All the code
// stays intact; flip the toggle back on to resume.
export const TRAINING_AUTOMATION_KEY = 'TRAINING_AUTOMATION_ENABLED'

export async function trainingAutomationEnabled(): Promise<boolean> {
  const v = (await getSetting(TRAINING_AUTOMATION_KEY)).trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'on'
}
