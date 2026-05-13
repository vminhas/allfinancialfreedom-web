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

// Best-effort recovery: try the command, log the outcome, never abort the
// build. Used for `prisma migrate resolve` calls that should self-heal a
// known-bad state but are no-ops in any other environment.
function tryRun(cmd, args, note) {
  console.log(`\n[build] ${note}`)
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (r.status !== 0) {
    console.log(`[build] (recovery step exited ${r.status}, continuing — this is expected if the migration is not in a failed state)`)
  }
}

run('npx', ['prisma', 'generate'])

const env = process.env.VERCEL_ENV
if (env === 'production' || !env) {
  // Self-heal a previously-failed migration. The 2026-05-05 multi-video
  // migration shipped with snake_case column references in its UPDATE that
  // didn't match the actual camelCase Postgres columns (videoUrl /
  // videoTitle, defined without a Prisma @map). The first deploy committed
  // the preceding notifications migration and then failed mid-transaction
  // on this one, leaving the row in `_prisma_migrations` flagged as failed
  // and blocking every subsequent deploy. Marking it rolled-back here is a
  // no-op in clean databases (the resolve command exits non-zero and we
  // swallow it via tryRun) and unblocks the production database where the
  // failed row exists. Safe to remove from this script after one
  // successful production deploy.
  tryRun(
    'npx',
    ['prisma', 'migrate', 'resolve', '--rolled-back', '20260505010000_phase_item_multi_video'],
    'Recovery: marking previously-failed multi-video migration as rolled-back so migrate deploy can retry it',
  )
  tryRun(
    'npx',
    ['prisma', 'migrate', 'resolve', '--rolled-back', '20260507210000_fix_phone_float_strings'],
    'Recovery: marking previously-failed phone-float migration as rolled-back so migrate deploy can retry it with the corrected table name',
  )
  tryRun(
    'npx',
    ['prisma', 'migrate', 'resolve', '--rolled-back', '20260513000000_promotion_items_announce'],
    'Recovery: marking previously-failed promotion-items-announce migration as rolled-back so migrate deploy can retry it with the corrected column name (itemKey not item_key)',
  )
  run('npx', ['prisma', 'migrate', 'deploy'])
} else {
  console.log(`\n[build] Skipping prisma migrate deploy on VERCEL_ENV=${env}`)
}

run('npx', ['next', 'build'])
