/**
 * Import individual agent APT checklist data into PhaseItem records.
 * Updates existing PhaseItem rows with completion status parsed from APT files.
 *
 * Run with: npx tsx scripts/import-apt-checklists.ts
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

// Map APT checklist keys → { phase, itemKey }
// p5_license_* are Phase 5 licenses; regular license_* (without prefix) are Phase 4
const ITEM_PHASE_MAP: Record<string, { phase: number; itemKey: string }> = {
  // Phase 1
  week1_onboarding:       { phase: 1, itemKey: 'week1_onboarding' },
  licensing_class:        { phase: 1, itemKey: 'licensing_class' },
  pfr:                    { phase: 1, itemKey: 'pfr' },
  fast_start_school:      { phase: 1, itemKey: 'fast_start_school' },
  week2_onboarding:       { phase: 1, itemKey: 'week2_onboarding' },
  '3_business_partners':  { phase: 1, itemKey: '3_business_partners' },
  business_marketing_plan:{ phase: 1, itemKey: 'business_marketing_plan' },
  pass_license_test:      { phase: 1, itemKey: 'pass_license_test' },
  fingerprints_apply:     { phase: 1, itemKey: 'fingerprints_apply' },
  week3_onboarding:       { phase: 1, itemKey: 'week3_onboarding' },
  master_scripts:         { phase: 1, itemKey: 'master_scripts' },
  schedule_10_trainings:  { phase: 1, itemKey: 'schedule_10_trainings' },
  // Phase 2
  fta_1:                  { phase: 2, itemKey: 'fta_1' },
  fta_2:                  { phase: 2, itemKey: 'fta_2' },
  fta_3:                  { phase: 2, itemKey: 'fta_3' },
  fta_4:                  { phase: 2, itemKey: 'fta_4' },
  fta_5:                  { phase: 2, itemKey: 'fta_5' },
  fta_6:                  { phase: 2, itemKey: 'fta_6' },
  fta_7:                  { phase: 2, itemKey: 'fta_7' },
  fta_8:                  { phase: 2, itemKey: 'fta_8' },
  fta_9:                  { phase: 2, itemKey: 'fta_9' },
  fta_10:                 { phase: 2, itemKey: 'fta_10' },
  associate_promotion:    { phase: 2, itemKey: 'associate_promotion' },
  direct_1:               { phase: 2, itemKey: 'direct_1' },
  direct_2:               { phase: 2, itemKey: 'direct_2' },
  direct_3:               { phase: 2, itemKey: 'direct_3' },
  client_1:               { phase: 2, itemKey: 'client_1' },
  client_2:               { phase: 2, itemKey: 'client_2' },
  client_3:               { phase: 2, itemKey: 'client_3' },
  net_license:            { phase: 2, itemKey: 'net_license' },
  first_1000:             { phase: 2, itemKey: 'first_1000' },
  // Phase 3
  cft_classes:            { phase: 3, itemKey: 'cft_classes' },
  trainer_signoff:        { phase: 3, itemKey: 'trainer_signoff' },
  cft_coordinator_signoff:{ phase: 3, itemKey: 'cft_coordinator_signoff' },
  emd_signoff:            { phase: 3, itemKey: 'emd_signoff' },
  client_1st_apt:         { phase: 3, itemKey: 'client_1st_apt' },
  client_2nd_apt:         { phase: 3, itemKey: 'client_2nd_apt' },
  phone_call_scripts:     { phase: 3, itemKey: 'phone_call_scripts' },
  recruiting_interview:   { phase: 3, itemKey: 'recruiting_interview' },
  top_5_products:         { phase: 3, itemKey: 'top_5_products' },
  // Phase 4
  '45k_points':           { phase: 4, itemKey: '45k_points' },
  month1_premium:         { phase: 4, itemKey: 'month1_premium' },
  month2_premium:         { phase: 4, itemKey: 'month2_premium' },
  month3_premium:         { phase: 4, itemKey: 'month3_premium' },
  license_1:              { phase: 4, itemKey: 'license_1' },
  license_2:              { phase: 4, itemKey: 'license_2' },
  license_3:              { phase: 4, itemKey: 'license_3' },
  license_4:              { phase: 4, itemKey: 'license_4' },
  license_5:              { phase: 4, itemKey: 'license_5' },
  // Phase 5
  '150k_net_6mo':         { phase: 5, itemKey: '150k_net_6mo' },
  '1_marketing_director': { phase: 5, itemKey: '1_marketing_director' },
  p5_license_1:           { phase: 5, itemKey: 'license_1' },
  p5_license_2:           { phase: 5, itemKey: 'license_2' },
  p5_license_3:           { phase: 5, itemKey: 'license_3' },
  p5_license_4:           { phase: 5, itemKey: 'license_4' },
  p5_license_5:           { phase: 5, itemKey: 'license_5' },
  p5_license_6:           { phase: 5, itemKey: 'license_6' },
  p5_license_7:           { phase: 5, itemKey: 'license_7' },
  p5_license_8:           { phase: 5, itemKey: 'license_8' },
  p5_license_9:           { phase: 5, itemKey: 'license_9' },
  p5_license_10:          { phase: 5, itemKey: 'license_10' },
  p5_license_11:          { phase: 5, itemKey: 'license_11' },
  p5_license_12:          { phase: 5, itemKey: 'license_12' },
  p5_license_13:          { phase: 5, itemKey: 'license_13' },
  p5_license_14:          { phase: 5, itemKey: 'license_14' },
  p5_license_15:          { phase: 5, itemKey: 'license_15' },
  p5_license_16:          { phase: 5, itemKey: 'license_16' },
  p5_license_17:          { phase: 5, itemKey: 'license_17' },
  p5_license_18:          { phase: 5, itemKey: 'license_18' },
  p5_license_19:          { phase: 5, itemKey: 'license_19' },
  p5_license_20:          { phase: 5, itemKey: 'license_20' },
}

interface AptData {
  agentCode: string
  agentName: string
  checklist: Record<string, boolean>
}

async function main() {
  const dataPath = join(process.cwd(), 'scripts', 'apt-checklist-data.json')
  const aptData: Record<string, AptData> = JSON.parse(readFileSync(dataPath, 'utf-8'))

  const agentCodes = Object.keys(aptData)
  console.log(`Importing checklist data for ${agentCodes.length} agents...`)

  let agentsUpdated = 0
  let itemsUpdated = 0
  let agentsNotFound = 0

  for (const agentCode of agentCodes) {
    const data = aptData[agentCode]

    const profile = await prisma.agentProfile.findUnique({
      where: { agentCode },
      select: { id: true, phase: true },
    })

    if (!profile) {
      agentsNotFound++
      continue
    }

    let updatesForAgent = 0

    for (const [aptKey, checked] of Object.entries(data.checklist)) {
      if (!checked) continue  // only update items that are checked in the APT

      const mapping = ITEM_PHASE_MAP[aptKey]
      if (!mapping) continue

      // Only update if the item exists in the DB (was seeded)
      const existing = await prisma.phaseItem.findUnique({
        where: {
          agentProfileId_phase_itemKey: {
            agentProfileId: profile.id,
            phase: mapping.phase,
            itemKey: mapping.itemKey,
          },
        },
      })

      if (!existing) continue
      if (existing.completed) continue  // already marked done, skip

      await prisma.phaseItem.update({
        where: {
          agentProfileId_phase_itemKey: {
            agentProfileId: profile.id,
            phase: mapping.phase,
            itemKey: mapping.itemKey,
          },
        },
        data: {
          completed: true,
          completedAt: new Date(),
        },
      })

      updatesForAgent++
      itemsUpdated++
    }

    if (updatesForAgent > 0) {
      agentsUpdated++
    }
  }

  console.log(`\n✓ Done:`)
  console.log(`  Agents updated: ${agentsUpdated}`)
  console.log(`  Total items marked complete: ${itemsUpdated}`)
  console.log(`  Agents not found in DB: ${agentsNotFound}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
