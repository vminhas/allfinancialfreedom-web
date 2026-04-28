// Prisma CLI config. The `datasource.url` here is what `prisma migrate deploy`
// connects to during the build — runtime queries (in src/lib/db.ts) read
// DATABASE_URL directly.
//
// Neon ships two connection strings: a *pooled* URL (for runtime) and a
// *direct* URL (for migrations). The pooler can't hold the Postgres advisory
// lock that Prisma migrate needs (`pg_advisory_lock(72707369)`), which causes
// a 10-second timeout — P1002 — on every deploy.
//
// Fix: prefer DIRECT_URL when set. Set DIRECT_URL in Vercel env vars to the
// non-pooler Neon connection string (drop the "-pooler" segment from the
// hostname). DATABASE_URL stays the pooled URL for runtime.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
