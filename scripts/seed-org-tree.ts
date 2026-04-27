/**
 * Seed script: Creates agents and wires up recruiter relationships.
 * Run with: npx tsx scripts/seed-org-tree.ts
 *
 * - If an agent already exists (by agentCode), only updates recruiterId
 * - If an agent doesn't exist, creates them with Phase 1 checklist + carriers
 * - Skips agents recruited by "Vick Minhas" or "Melinee Minhas" (they stay top-level)
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const pool = new (await import('pg')).default.Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter } as never)

interface AgentSeed {
  agentCode: string
  firstName: string
  lastName: string
  state: string
  email: string
  phone: string
  recruiterName: string
  status: 'ACTIVE' | 'INACTIVE'
}

// Recruiter name → agentCode mapping
const RECRUITER_MAP: Record<string, string | null> = {
  'Vick Minhas': null,
  'Melinee Minhas': null,
  'Jeremy Davis': 'B3570',
  'Kerri Parks': null,           // not in dataset, will be top-level
  'Mercedes (Sadie) Grubb': 'D2161',
  'Mercedes Grubb': 'D2161',
  'Sam Yonce': 'D4449',
  'Sam Yonce ': 'D4449',
  'Heather Cullum': 'E5677',
  'Kiirah Washington': 'F2030',
  'Dionne Nicotera': 'B5947',
  'Kyla Grigg': 'E8491',
  'Dr. Tamarah Davis': 'E9316',
  'Tamarah Davis': 'E9316',
  'Tamarah Davis ': 'E9316',
  'Doug Morrison': 'E9748',
  'Giovanni Arellano': 'F6335',
  'Keyiana T Lindsey': 'F5083',
  'Keyiana Thomson Lindsey': 'F5083',
}

const AGENTS: AgentSeed[] = [
  { agentCode: 'B3570', firstName: 'Jeremy', lastName: 'Davis', state: 'TX', email: 'jdfortrey@gmail.com', phone: '(817) 909-2690', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'B5890', firstName: 'Sebastien', lastName: 'Huang', state: 'TX', email: 'sebastien.huang@outlook.com', phone: '832-454-0463', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'B5947', firstName: 'Dionne', lastName: 'Nicotera', state: 'NY', email: 'dnicotera1217@gmail.com', phone: '(315) 404-1113', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'B6067', firstName: 'James', lastName: 'Jackson III', state: 'FL', email: 'jamesjacksoniii81@gmail.com', phone: '(786) 537-6049', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'B7607', firstName: 'Adriana', lastName: 'Martinez', state: 'MA', email: 'financial1st.responder@gmail.com', phone: '(617) 803-4976', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'D2161', firstName: 'Mercedes', lastName: 'Grubb', state: 'IA', email: 'mgrubb.gfi@gmail.com', phone: '641-436-7563', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'D4449', firstName: 'Sam', lastName: 'Yonce', state: 'NC', email: 'syonce61@gmail.com', phone: '(423) 956-1694', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'E1563', firstName: 'Audette', lastName: 'Brooks', state: 'NY', email: 'abrooks25.gfi@gmail.com', phone: '(347) 451-7103', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'E4794', firstName: 'Nickolas', lastName: 'Scholz', state: 'IN', email: 'nickscholz69@gmail.com', phone: '(574) 297-4726', recruiterName: 'Melinee Minhas', status: 'ACTIVE' },
  { agentCode: 'E5677', firstName: 'Heather', lastName: 'Cullum', state: 'MD', email: 'hcullum.gfi@gmail.com', phone: '(443) 928-0342', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'E5893', firstName: 'Michael', lastName: 'Callahan', state: 'AZ', email: 'meacallahan@outlook.com', phone: '623-326-6758', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'E7020', firstName: 'Tracy', lastName: 'Gouge', state: 'NC', email: 'tgouge.gfi@gmail.com', phone: '(828) 385-3084', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'E8491', firstName: 'Kyla', lastName: 'Grigg', state: 'OH', email: 'kmhammel97@gmail.com', phone: '(740) 885-8644', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'E9316', firstName: 'Tamarah', lastName: 'Davis', state: 'MA', email: 'tamarah.davis@gmail.com', phone: '(857) 231-2110', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'E9748', firstName: 'Doug', lastName: 'Morrison', state: 'OH', email: 'morrison1dm@gmail.com', phone: '(260) 417-3825', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'E9753', firstName: 'Bryon', lastName: 'Dahle', state: 'SD', email: 'bryon.dahle.gfi@gmail.com', phone: '(605) 530-0527', recruiterName: 'Mercedes (Sadie) Grubb', status: 'ACTIVE' },
  { agentCode: 'F0476', firstName: 'Vivekanand', lastName: 'Ramakrishnan', state: 'NC', email: 'vramakrishnan.gfi@gmail.com', phone: '(984) 500-9229', recruiterName: 'Sam Yonce', status: 'ACTIVE' },
  { agentCode: 'F1011', firstName: 'Brian', lastName: 'Sasser', state: 'MO', email: 'bsasser91@gmail.com', phone: '(816) 520-8605', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'F1461', firstName: 'Marya', lastName: 'Hay', state: 'VA', email: 'browngirlinterrupting@gmail.com', phone: '(202) 465-2558', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'F2030', firstName: 'Kiirah', lastName: 'Washington', state: 'TX', email: 'crownroyalleproductions@gmail.com', phone: '(832) 689-7577', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'F3240', firstName: 'Olubukola', lastName: 'Akande', state: 'NY', email: 'bukki1ola@yahoo.com', phone: '(347) 693-0666', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'F3683', firstName: 'Noel', lastName: 'Higgins', state: 'MD', email: 'noelhiggins1216@gmail.com', phone: '(240) 300-0743', recruiterName: 'Heather Cullum', status: 'ACTIVE' },
  { agentCode: 'F3855', firstName: 'Hayley', lastName: 'Golden', state: 'MD', email: 'hayyleyy625@gmail.com', phone: '(240) 808-0231', recruiterName: 'Heather Cullum', status: 'ACTIVE' },
  { agentCode: 'F4503', firstName: 'David', lastName: 'Sylvester', state: 'TX', email: 'david.sylvester.j@gmail.com', phone: '346-498-3183', recruiterName: 'Kiirah Washington', status: 'ACTIVE' },
  { agentCode: 'F5017', firstName: 'George', lastName: 'Haas', state: 'AZ', email: 'mike44@cox.net', phone: '602-762-5557', recruiterName: 'Dionne Nicotera', status: 'ACTIVE' },
  { agentCode: 'F5083', firstName: 'Keyiana', lastName: 'Lindsey', state: 'TX', email: 'keyianal11@gmail.com', phone: '281-381-4468', recruiterName: 'Kiirah Washington', status: 'ACTIVE' },
  { agentCode: 'F5254', firstName: 'Allen', lastName: 'Grigg', state: 'OH', email: 'armglovestrucking@gmail.com', phone: '', recruiterName: 'Kyla Grigg', status: 'ACTIVE' },
  { agentCode: 'F5257', firstName: 'Richard', lastName: 'Brown', state: 'NY', email: 'rixchh42069@gmail.com', phone: '315-664-9082', recruiterName: 'Dionne Nicotera', status: 'ACTIVE' },
  { agentCode: 'F5748', firstName: 'David', lastName: 'Tonaszuck', state: 'MA', email: 'd.tonaszuck@yahoo.com', phone: '781-733-0416', recruiterName: 'Mercedes (Sadie) Grubb', status: 'ACTIVE' },
  { agentCode: 'F5960', firstName: 'Samuel', lastName: 'Spurgeon', state: 'IN', email: 'samspurgeon12345@gmail.com', phone: '', recruiterName: 'Doug Morrison', status: 'ACTIVE' },
  { agentCode: 'F6069', firstName: 'Amber', lastName: 'Smith', state: 'CO', email: 'amberruthmsmith@gmail.com', phone: '', recruiterName: 'Sam Yonce', status: 'ACTIVE' },
  { agentCode: 'F6230', firstName: 'Bhavita', lastName: 'Patel', state: 'TN', email: 'bhavitapatel5593@gmail.com', phone: '541-819-2633', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'F6235', firstName: 'William', lastName: 'Banks', state: 'CT', email: 'wbanks430@gmail.com', phone: '518-417-8191', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'F6262', firstName: 'Chanikan', lastName: 'Sanchez', state: 'NJ', email: 'chanitsanchez@gmail.com', phone: '', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'F7373', firstName: 'Crystal', lastName: 'Briggs', state: 'MA', email: 'crystalmbriggs08@gmail.com', phone: '', recruiterName: 'Keyiana T Lindsey', status: 'ACTIVE' },
  { agentCode: 'F6335', firstName: 'Giovanni', lastName: 'Arellano', state: 'CO', email: 'gioare1017@gmail.com', phone: '626-361-9110', recruiterName: 'Mercedes (Sadie) Grubb', status: 'ACTIVE' },
  { agentCode: 'F6354', firstName: 'Kaytlyn', lastName: 'Allen', state: 'GA', email: 'kaytlynallen.gfi@gmail.com', phone: '', recruiterName: 'Mercedes (Sadie) Grubb', status: 'ACTIVE' },
  { agentCode: 'F6991', firstName: 'Justin', lastName: 'Hall', state: 'TN', email: 'carbongreen90@gmail.com', phone: '931-287-7831', recruiterName: 'Doug Morrison', status: 'ACTIVE' },
  { agentCode: 'F7096', firstName: 'Tiffany', lastName: 'Raper', state: 'MA', email: 'tiffanyqualls@hotmail.com', phone: '857-247-9596', recruiterName: 'Dr. Tamarah Davis', status: 'ACTIVE' },
  { agentCode: 'F7039', firstName: 'Donnisha', lastName: 'Marvels', state: 'TX', email: 'dmarvels@yahoo.com', phone: '903-570-1714', recruiterName: 'Mercedes (Sadie) Grubb', status: 'ACTIVE' },
  { agentCode: 'F7415', firstName: 'Adonai', lastName: 'Bereket', state: 'TX', email: 'adonaibereket@gmail.com', phone: '469-655-6307', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'F7756', firstName: 'Alexis', lastName: 'Walker', state: 'NC', email: 'walkeralexis1025@gmail.com', phone: '814-215-3844', recruiterName: 'Sam Yonce', status: 'ACTIVE' },
  { agentCode: 'F7754', firstName: 'Nike', lastName: 'Raymond', state: 'NY', email: 'nikesonline@gmail.com', phone: '845-461-8621', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'F7585', firstName: 'Ajanae', lastName: 'Jones', state: 'CO', email: 'naenaebaby333@icloud.com', phone: '313-726-1303', recruiterName: 'Giovanni Arellano', status: 'ACTIVE' },
  { agentCode: 'F7632', firstName: 'Gabriel', lastName: 'Robinson', state: 'CO', email: 'grobins454@gmail.com', phone: '719-775-6791', recruiterName: 'Giovanni Arellano', status: 'ACTIVE' },
  { agentCode: 'F7579', firstName: 'Stephanie', lastName: 'Silva', state: 'NJ', email: 'stephsilva23@gmail.com', phone: '908-377-6332', recruiterName: 'Dionne Nicotera', status: 'ACTIVE' },
  { agentCode: 'F7824', firstName: 'Tina', lastName: 'Caron', state: 'CA', email: 'tctinacaron@gmail.com', phone: '310-499-8045', recruiterName: 'Jeremy Davis', status: 'ACTIVE' },
  { agentCode: 'F7932', firstName: 'Christopher', lastName: 'Bond', state: 'OH', email: 'cbll007007@gmail.com', phone: '614-598-9930', recruiterName: 'Dr. Tamarah Davis', status: 'ACTIVE' },
  { agentCode: 'F8045', firstName: 'Kylie', lastName: 'Gibbs', state: 'MS', email: 'kylielg223@gmail.com', phone: '417-939-0195', recruiterName: 'Mercedes Grubb', status: 'ACTIVE' },
  { agentCode: 'F8064', firstName: 'Jameel', lastName: 'Marsden', state: 'NY', email: 'jmarsitect@gmail.com', phone: '917-548-4787', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
  { agentCode: 'F8075', firstName: 'Morgan', lastName: 'White', state: 'CA', email: 'morgankwhite03@gmail.com', phone: '850-529-8436', recruiterName: 'Mercedes Grubb', status: 'ACTIVE' },
  { agentCode: 'F8092', firstName: 'Tiffany', lastName: 'Davis', state: 'TN', email: 'tiffany00lynn@gmail.com', phone: '615-971-8794', recruiterName: 'Dr. Tamarah Davis', status: 'ACTIVE' },
  { agentCode: 'F8089', firstName: 'Mya', lastName: 'Allen', state: 'FL', email: 'myaallen529@outlook.com', phone: '229-439-6842', recruiterName: 'Mercedes Grubb', status: 'ACTIVE' },
  { agentCode: 'F8198', firstName: 'Zury', lastName: 'Bautista', state: 'MN', email: 'bauzu15@gmail.com', phone: '612-541-8897', recruiterName: 'Mercedes Grubb', status: 'ACTIVE' },
  { agentCode: 'F8203', firstName: 'Marcus', lastName: 'Parker', state: 'MS', email: 'marcusap33@gmail.com', phone: '617-775-1103', recruiterName: 'Dr. Tamarah Davis', status: 'ACTIVE' },
  { agentCode: 'F8252', firstName: 'Erin', lastName: 'Morris', state: 'CA', email: 'erin06morris@yahoo.com', phone: '650-421-5083', recruiterName: 'Sam Yonce', status: 'ACTIVE' },
  { agentCode: 'F8431', firstName: 'Ivan', lastName: 'Ruiz', state: 'VA', email: 'moto1377@yahoo.com', phone: '571-527-6585', recruiterName: 'Vick Minhas', status: 'ACTIVE' },
]

// Phase 1 items (imported at runtime from agent-constants)
const PHASE_1_ITEMS = [
  'accept_invite', 'connect_discord', 'meet_trainer', 'set_goals',
  'apt_portal', 'product_clarity', 'intro_video', 'pre_licensing',
  'study_materials', 'pass_license_test', 'licensing_state_app',
  'fingerprints', 'carrier_appointments', 'ce_courses', 'eo_insurance',
  'direct_deposit', 'business_marketing_plan', 'fta_schedule_10',
]

const CARRIERS = [
  'ANICO', 'Augustar', 'Corebridge', 'Foresters', 'Mutual of Omaha',
  'Lincoln', 'North American', 'F&G', 'SILAC', 'American Equity',
  'Equitrust', 'Prudential', 'Allianz', 'Athene', 'Nationwide', 'Global Atlantic',
]

async function main() {
  console.log(`\nSeeding ${AGENTS.length} agents...\n`)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const agent of AGENTS) {
    const recruiterId = RECRUITER_MAP[agent.recruiterName] ?? null

    // Check if agent already exists
    const existing = await db.agentProfile.findFirst({
      where: { agentCode: agent.agentCode },
      select: { id: true, recruiterId: true },
    })

    if (existing) {
      // Update recruiterId if different
      if (existing.recruiterId !== recruiterId) {
        await db.agentProfile.update({
          where: { id: existing.id },
          data: { recruiterId },
        })
        console.log(`  ✓ Updated ${agent.firstName} ${agent.lastName} (${agent.agentCode}) → reports to ${recruiterId ?? 'top-level'}`)
        updated++
      } else {
        skipped++
      }
      continue
    }

    // Create new agent
    try {
      await db.agentUser.create({
        data: {
          email: agent.email.toLowerCase().trim(),
          profile: {
            create: {
              agentCode: agent.agentCode,
              firstName: agent.firstName,
              lastName: agent.lastName,
              state: agent.state,
              phone: agent.phone || null,
              recruiterId,
              status: agent.status,
              phase: 1,
              phaseStartedAt: new Date(),
              phaseItems: {
                create: PHASE_1_ITEMS.map(key => ({
                  phase: 1,
                  itemKey: key,
                  completed: false,
                })),
              },
              carrierAppointments: {
                create: CARRIERS.map(carrier => ({
                  carrier,
                  status: 'NOT_STARTED',
                })),
              },
            },
          },
        },
      })
      console.log(`  + Created ${agent.firstName} ${agent.lastName} (${agent.agentCode}) → reports to ${recruiterId ?? 'top-level'}`)
      created++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Unique constraint')) {
        console.log(`  ⚠ Skipped ${agent.firstName} ${agent.lastName} — email already exists`)
        skipped++
      } else {
        console.error(`  ✗ Failed ${agent.firstName} ${agent.lastName}: ${msg}`)
      }
    }

    // Small delay to avoid overwhelming the DB
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\nDone! Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`)
  console.log(`Total agents in seed: ${AGENTS.length}\n`)

  // Print the hierarchy for verification
  console.log('Hierarchy preview:')
  console.log('─ Vick Minhas (CEO)')
  for (const a of AGENTS.filter(a => RECRUITER_MAP[a.recruiterName] === null)) {
    console.log(`  ├─ ${a.firstName} ${a.lastName} (${a.agentCode})`)
    const recruits = AGENTS.filter(r => RECRUITER_MAP[r.recruiterName] === a.agentCode)
    for (const r of recruits) {
      console.log(`  │  ├─ ${r.firstName} ${r.lastName} (${r.agentCode})`)
      const sub = AGENTS.filter(s => RECRUITER_MAP[s.recruiterName] === r.agentCode)
      for (const s of sub) {
        console.log(`  │  │  ├─ ${s.firstName} ${s.lastName} (${s.agentCode})`)
      }
    }
  }

  await db.$disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
