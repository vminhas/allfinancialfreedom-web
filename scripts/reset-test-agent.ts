/**
 * Reset (or create) a test agent with a known password.
 * Run with: npx tsx scripts/reset-test-agent.ts
 */

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = new PrismaClient({ adapter } as any)

const TEST_EMAIL    = 'test@allfinancialfreedom.com'
const TEST_PASSWORD = 'testtest123'
const TEST_FIRST    = 'Test'
const TEST_LAST     = 'Agent'
const TEST_CODE     = 'TEST001'

const PHASE_1_KEYS = [
  'week1_onboarding', 'licensing_class', 'pfr', 'fast_start_school',
  'week2_onboarding', 'business_marketing_plan', 'pass_license_test',
  'fingerprints_apply', 'submit_to_aff', 'ce_courses', 'errors_and_omissions',
  'direct_deposit', 'week3_onboarding', 'master_scripts', 'schedule_10_trainings',
]

const CARRIERS = [
  'ANICO Life', 'ANICO Annuity', 'Augustar', 'Corebridge Life', 'Corebridge Annuity',
  'Lincoln', 'Foresters', 'Mutual of Omaha', 'SILAC', 'American Equity',
  'North American Life', 'North American Annuity', 'F&G Life', 'F&G Annuity',
  'Equitrust', 'Prudential',
]

async function run() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12)

  // Look up by email
  const existing = await db.agentUser.findUnique({
    where: { email: TEST_EMAIL },
    include: { profile: true },
  })

  if (existing) {
    // Reset password on existing test agent
    await db.agentUser.update({
      where: { id: existing.id },
      data: { passwordHash, inviteToken: null, inviteExpires: null },
    })
    // Make sure the profile is ACTIVE
    if (existing.profile) {
      await db.agentProfile.update({
        where: { id: existing.profile.id },
        data: { status: 'ACTIVE' },
      })
    }
    console.log('\n✓ Existing test agent password reset:')
  } else {
    // Create fresh test agent + profile + seeded phase items + carriers
    await db.agentUser.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        profile: {
          create: {
            agentCode: TEST_CODE,
            firstName: TEST_FIRST,
            lastName: TEST_LAST,
            state: 'CA',
            phase: 1,
            phaseStartedAt: new Date(),
            status: 'ACTIVE',
            phaseItems: {
              create: PHASE_1_KEYS.map(key => ({
                phase: 1,
                itemKey: key,
                completed: false,
              })),
            },
            carrierAppointments: {
              create: CARRIERS.map(carrier => ({ carrier, status: 'NOT_STARTED' })),
            },
          },
        },
      },
    })
    console.log('\n✓ New test agent created:')
  }

  console.log(`  Email:    ${TEST_EMAIL}`)
  console.log(`  Password: ${TEST_PASSWORD}`)
  console.log('\n  → Login at /agents/login\n')

  await pool.end()
}

run().catch(e => {
  console.error('Failed:', e)
  process.exit(1)
})
