// Build orchestrator. Runs the standard prisma generate + next build, but
// only runs `prisma migrate deploy` on production deployments.
//
// Why: every deploy (production AND preview) used to migrate, which means
// concurrent deploys raced for the same Postgres advisory lock and one of
// them would die with P1002. Skipping migrations on preview eliminates the
// race entirely. Preview deploys still pick up schema changes via the
// Prisma client generated against the current schema; they just don't run
// migrate against the live database.
//
// Triggered automatically when `npm run build` runs on Vercel; Vercel sets
// VERCEL_ENV=production for the production branch and preview/development
// for everything else. Locally, where VERCEL_ENV is undefined, migrations
// run as a fallback so developers can still seed their dev DB with `npm
// run build`.

import { spawnSync } from 'node:child_process'

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('npx', ['prisma', 'generate'])

const env = process.env.VERCEL_ENV
if (env === 'production' || !env) {
  run('npx', ['prisma', 'migrate', 'deploy'])
} else {
  console.log(`\n[build] Skipping prisma migrate deploy on VERCEL_ENV=${env}`)
}

run('npx', ['next', 'build'])
