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
//   1. DIRECT_URL
//   2. DATABASE_URL_UNPOOLED
//   3. POSTGRES_URL_NON_POOLING
//   4. DATABASE_URL  (last-resort, pooled, may fail)
//
// AND we strip `-pooler` from the resolved hostname before handing it to
// Prisma. Some Neon integrations populate every "non-pooling" env var with
// the pooled URL anyway (the user's project is one of them), so the cascade
// alone isn't enough — the rewrite makes us bulletproof regardless of how
// the env vars were provisioned.
import "dotenv/config";
import { defineConfig } from "prisma/config";

function stripPoolerHost(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    // Strip "-pooler" from the hostname only, never from credentials or
    // the path. e.g. ep-foo-pooler.c-6.us-east-1.aws.neon.tech -> ep-foo.c-6.us-east-1.aws.neon.tech
    u.hostname = u.hostname.replace(/-pooler(?=\.|$)/, "");
    return u.toString();
  } catch {
    return url;
  }
}

const candidate =
  process.env["DIRECT_URL"] ||
  process.env["DATABASE_URL_UNPOOLED"] ||
  process.env["POSTGRES_URL_NON_POOLING"] ||
  process.env["DATABASE_URL"];

const migrationUrl = stripPoolerHost(candidate);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
