// Run: npx tsx scripts/reset-admin.ts
// Creates or resets admin user with a known password

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import bcrypt from 'bcryptjs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = new PrismaClient({ adapter } as any)

const ADMIN_EMAIL = 'admin@allfinancialfreedom.com'
const ADMIN_NAME  = 'AFF Admin'
const ADMIN_PASS  = 'AFF@admin2025!'   // change after first login

async function run() {
  const hash = await bcrypt.hash(ADMIN_PASS, 12)

  const admin = await db.adminUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: hash },
    create: { email: ADMIN_EMAIL, name: ADMIN_NAME, passwordHash: hash },
  })

  console.log('\n✓ Admin user ready:')
  console.log(`  Email:    ${admin.email}`)
  console.log(`  Password: ${ADMIN_PASS}`)
  console.log('\n  → Login at: https://www.allfinancialfreedom.com/vault/login')
  console.log('  → Change your password after first login!\n')

  await pool.end()
}

run().catch(e => { console.error(e); process.exit(1) })
