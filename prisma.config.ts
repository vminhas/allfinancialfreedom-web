// Prisma CLI config. The `datasource.url` here is what `prisma migrate deploy`
// connects to during the build — runtime queries (in src/lib/db.ts) read
// DATABASE_URL directly.
//
// Neon ships two connection strings: a *pooled* URL (for runtime) and a
// *direct* URL (for migrations). The pooler can't hold the Postgres advisory
// lock that Prisma migrate needs (`pg_advisory_lock(72707369)`), which causes
// a 10-second timeout — P1002 — on every deploy.
//
// Resolution order (first non-empty wins):
//   1. DIRECT_URL                  — manual override
//   2. DATABASE_URL_UNPOOLED       — Neon integration sometimes auto-sets this
//   3. POSTGRES_URL_NON_POOLING    — Neon's legacy auto-set unpooled URL,
//                                    confirmed present in this project's env
//   4. DATABASE_URL                — last-resort fallback (pooled, may fail)
//
// As long as ANY unpooled URL is in env, migrations succeed.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationUrl =
  process.env["DIRECT_URL"] ||
  process.env["DATABASE_URL_UNPOOLED"] ||
  process.env["POSTGRES_URL_NON_POOLING"] ||
  process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
