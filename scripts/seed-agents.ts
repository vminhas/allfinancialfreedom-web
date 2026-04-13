/**
 * Seed all agents from the parsed Excel data into the database.
 * Run with: npx tsx scripts/seed-agents.ts
 *
 * - Creates AgentUser + AgentProfile for each agent
 * - Seeds phase items (previous phases marked complete, current phase incomplete)
 * - Seeds carrier appointments from spreadsheet status
 * - Does NOT send invite emails — use the AFF Tracker to resend when ready
 * - Safe to re-run: uses upsert on agentCode (skips existing agents)
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

// Phase items mirror src/lib/agent-constants.ts
const PHASE_ITEMS: Record<number, { key: string; label: string }[]> = {
  1: [
    { key: 'week1_onboarding', label: 'Week 1 Onboarding' },
    { key: 'licensing_class', label: 'Licensing Class / Schedule Test' },
    { key: 'pfr', label: 'Personal Financial Review' },
    { key: 'fast_start_school', label: 'Fast Start School' },
    { key: 'week2_onboarding', label: 'Week 2 Onboarding' },
    { key: '3_business_partners', label: '3 Business Partners' },
    { key: 'business_marketing_plan', label: 'Business Marketing Plan' },
    { key: 'pass_license_test', label: 'Pass Life License Test' },
    { key: 'fingerprints_apply', label: 'Fingerprints + Apply for License' },
    { key: 'week3_onboarding', label: 'Week 3 Onboarding' },
    { key: 'master_scripts', label: 'Master Scripts' },
    { key: 'schedule_10_trainings', label: 'Schedule 10 Training Appointments' },
  ],
  2: [
    { key: 'fta_1', label: 'Field Training 1' },
    { key: 'fta_2', label: 'Field Training 2' },
    { key: 'fta_3', label: 'Field Training 3' },
    { key: 'fta_4', label: 'Field Training 4' },
    { key: 'fta_5', label: 'Field Training 5' },
    { key: 'fta_6', label: 'Field Training 6' },
    { key: 'fta_7', label: 'Field Training 7' },
    { key: 'fta_8', label: 'Field Training 8' },
    { key: 'fta_9', label: 'Field Training 9' },
    { key: 'fta_10', label: 'Field Training 10' },
    { key: 'associate_promotion', label: 'Associate Promotion' },
    { key: 'direct_1', label: 'Direct 1' },
    { key: 'direct_2', label: 'Direct 2' },
    { key: 'direct_3', label: 'Direct 3' },
    { key: 'client_1', label: 'Client Helped 1' },
    { key: 'client_2', label: 'Client Helped 2' },
    { key: 'client_3', label: 'Client Helped 3' },
    { key: 'net_license', label: 'Net License' },
    { key: 'first_1000', label: 'Make Your 1st $1,000' },
  ],
  3: [
    { key: 'cft_classes', label: 'Attend CFT in Progress Classes' },
    { key: 'trainer_signoff', label: 'Signed off By Trainer' },
    { key: 'cft_coordinator_signoff', label: 'CFT Coordinator Sign Off' },
    { key: 'emd_signoff', label: 'EMD Sign Off' },
    { key: 'client_1st_apt', label: 'Client 1st Appointment' },
    { key: 'client_2nd_apt', label: 'Client 2nd Appointment' },
    { key: 'phone_call_scripts', label: 'Phone Call Scripts' },
    { key: 'recruiting_interview', label: 'Recruiting Interview' },
    { key: 'top_5_products', label: 'Top 5 Products Knowledge' },
  ],
  4: [
    { key: '45k_points', label: '45,000 Points' },
    { key: 'month1_premium', label: 'Month 1 Premium Goal' },
    { key: 'month2_premium', label: 'Month 2 Premium Goal' },
    { key: 'month3_premium', label: 'Month 3 Premium Goal' },
    { key: 'license_1', label: 'Team License 1 (Net)' },
    { key: 'license_2', label: 'Team License 2 (Net)' },
    { key: 'license_3', label: 'Team License 3 (Net)' },
    { key: 'license_4', label: 'Team License 4 (Net)' },
    { key: 'license_5', label: 'Team License 5 (Net)' },
  ],
  5: [
    { key: '150k_net_6mo', label: '150,000 Net Points in 6 months' },
    { key: '1_marketing_director', label: '1 Marketing Director' },
    { key: 'license_1', label: 'Team License 1' },
    { key: 'license_2', label: 'Team License 2' },
    { key: 'license_3', label: 'Team License 3' },
    { key: 'license_4', label: 'Team License 4' },
    { key: 'license_5', label: 'Team License 5' },
    { key: 'license_6', label: 'Team License 6' },
    { key: 'license_7', label: 'Team License 7' },
    { key: 'license_8', label: 'Team License 8' },
    { key: 'license_9', label: 'Team License 9' },
    { key: 'license_10', label: 'Team License 10' },
    { key: 'license_11', label: 'Team License 11' },
    { key: 'license_12', label: 'Team License 12' },
    { key: 'license_13', label: 'Team License 13' },
    { key: 'license_14', label: 'Team License 14' },
    { key: 'license_15', label: 'Team License 15' },
    { key: 'license_16', label: 'Team License 16' },
    { key: 'license_17', label: 'Team License 17' },
    { key: 'license_18', label: 'Team License 18' },
    { key: 'license_19', label: 'Team License 19' },
    { key: 'license_20', label: 'Team License 20' },
  ],
}

const ALL_CARRIERS = [
  'ANICO Life', 'ANICO Annuity', 'Augustar', 'Corebridge Life', 'Corebridge Annuity',
  'Lincoln', 'Foresters', 'Mutual of Omaha', 'SILAC', 'American Equity',
  'North American Life', 'North American Annuity', 'F&G Life', 'F&G Annuity',
  'Equitrust', 'Prudential',
]

interface AgentSeedData {
  agentCode: string
  firstName: string
  lastName: string
  email: string | null
  state: string | null
  icaDate: string | null
  recruiter: string | null
  cft: string | null
  eliteCft: string | null
  status: 'ACTIVE' | 'INACTIVE'
  phase: number
  goal: string | null
  trainer: string | null
  initialPointOfContact: string | null
  npn: string | null
  dateOfBirth: string | null
  phone: string | null
  examDate: string | null
  licenseNumber: string | null
  dateSubmittedToGfi: string | null
  clientProduct: string | null
  licenseProcess: string | null
  welcomeLetterSentAt: string | null
  discordJoinDate: string | null
  carriers: Record<string, { status: string; producerNumber: string | null }>
}

function toDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

async function main() {
  const dataPath = join(process.cwd(), 'scripts', 'agents-seed-data.json')
  const agents: AgentSeedData[] = JSON.parse(readFileSync(dataPath, 'utf-8'))

  console.log(`Seeding ${agents.length} agents...`)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const agent of agents) {
    try {
      // Check if agent already exists
      const existing = await prisma.agentProfile.findUnique({
        where: { agentCode: agent.agentCode },
      })
      if (existing) {
        skipped++
        continue
      }

      // Build email — use placeholder for agents missing one
      const email = agent.email
        ? agent.email.toLowerCase()
        : `agent-${agent.agentCode.toLowerCase()}@placeholder.allfinancialfreedom.com`

      // Check if email already taken by another AgentUser
      const emailTaken = await prisma.agentUser.findUnique({ where: { email } })
      const finalEmail = emailTaken
        ? `agent-${agent.agentCode.toLowerCase()}-dup@placeholder.allfinancialfreedom.com`
        : email

      // Create AgentUser (no password — admin resends invite when ready)
      const agentUser = await prisma.agentUser.create({
        data: {
          email: finalEmail,
          passwordHash: null,
          inviteToken: null,
          inviteExpires: null,
        },
      })

      // Create AgentProfile
      const profile = await prisma.agentProfile.create({
        data: {
          agentUserId: agentUser.id,
          agentCode: agent.agentCode,
          firstName: agent.firstName,
          lastName: agent.lastName,
          state: agent.state,
          phone: agent.phone,
          dateOfBirth: toDate(agent.dateOfBirth),
          npn: agent.npn,
          icaDate: toDate(agent.icaDate),
          recruiterId: agent.recruiter,
          cft: agent.cft,
          eliteCft: agent.eliteCft,
          status: agent.status,
          phase: agent.phase,
          phaseStartedAt: toDate(agent.icaDate) ?? new Date(),
          goal: agent.goal,
          initialPointOfContact: agent.initialPointOfContact,
          examDate: toDate(agent.examDate),
          licenseNumber: agent.licenseNumber,
          dateSubmittedToGfi: toDate(agent.dateSubmittedToGfi),
          clientProduct: agent.clientProduct,
          licenseProcess: agent.licenseProcess,
          welcomeLetterSentAt: toDate(agent.welcomeLetterSentAt),
          discordJoinDate: toDate(agent.discordJoinDate),
        },
      })

      // Seed phase items: phases before current = all complete, current + future = incomplete
      const phaseItemsData = []
      for (let p = 1; p <= 5; p++) {
        const items = PHASE_ITEMS[p] ?? []
        const isCompletedPhase = p < agent.phase
        for (const item of items) {
          phaseItemsData.push({
            agentProfileId: profile.id,
            phase: p,
            itemKey: item.key,
            completed: isCompletedPhase,
            completedAt: isCompletedPhase ? new Date() : null,
          })
        }
      }
      if (phaseItemsData.length > 0) {
        await prisma.phaseItem.createMany({ data: phaseItemsData })
      }

      // Seed carrier appointments
      const carrierData = []
      for (const carrier of ALL_CARRIERS) {
        const src = agent.carriers[carrier] ?? {}
        const rawStatus = src.status ?? 'NOT_STARTED'
        const status = ['APPOINTED', 'PENDING', 'JIT', 'NOT_STARTED'].includes(rawStatus)
          ? (rawStatus as 'APPOINTED' | 'PENDING' | 'JIT' | 'NOT_STARTED')
          : 'NOT_STARTED'
        carrierData.push({
          agentProfileId: profile.id,
          carrier,
          status,
          producerNumber: src.producerNumber ?? null,
          appointedDate: status === 'APPOINTED' ? new Date() : null,
        })
      }
      await prisma.carrierAppointment.createMany({ data: carrierData })

      created++
      if (created % 25 === 0) {
        console.log(`  ${created} created...`)
      }
    } catch (err) {
      console.error(`  ✗ Error on ${agent.agentCode} (${agent.firstName} ${agent.lastName}):`, err)
      errors++
    }
  }

  console.log(`\n✓ Done: ${created} created, ${skipped} skipped (already existed), ${errors} errors`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
