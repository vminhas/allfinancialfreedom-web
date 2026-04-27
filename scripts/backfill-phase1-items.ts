/**
 * Backfill 4 new Phase 1 licensing items for existing agents.
 *
 * New items added to agent-constants.ts after initial seed:
 *   submit_to_aff, ce_courses, errors_and_omissions, direct_deposit
 *
 * Run: export $(grep -v '^#' .env | grep DATABASE_URL | xargs) && npx tsx scripts/backfill-phase1-items.ts
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any)

const NEW_ITEMS = [
  { itemKey: 'submit_to_aff', label: 'Submit to AFF' },
  { itemKey: 'ce_courses', label: 'CE Courses (AML, Annuity & Ethics)' },
  { itemKey: 'errors_and_omissions', label: 'Errors & Omissions Insurance' },
  { itemKey: 'direct_deposit', label: 'Set Up Direct Deposit' },
]

async function main() {
  const profiles = await prisma.agentProfile.findMany({ select: { id: true, phase: true } })
  console.log(`Found ${profiles.length} agent profiles.`)

  let inserted = 0
  let skipped = 0

  for (const profile of profiles) {
    for (const item of NEW_ITEMS) {
      // Check if row already exists
      const existing = await prisma.phaseItem.findUnique({
        where: { agentProfileId_phase_itemKey: { agentProfileId: profile.id, phase: 1, itemKey: item.itemKey } },
      })
      if (existing) {
        skipped++
        continue
      }

      // Agents past Phase 1 get these marked complete; current/future Phase 1 agents stay false
      const isComplete = profile.phase > 1
      await prisma.phaseItem.create({
        data: {
          agentProfileId: profile.id,
          phase: 1,
          itemKey: item.itemKey,
          completed: isComplete,
          completedAt: isComplete ? new Date() : null,
        },
      })
      inserted++
    }
  }

  console.log(`\n✓ Done: ${inserted} rows inserted, ${skipped} already existed.`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
