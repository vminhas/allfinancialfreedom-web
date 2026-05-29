-- LC Notes Guide SOP support.
--   * new_business_notes.tevah_verified: per-note "Verified through Tevah" flag
--   * licensing_notes.purpose: optional LicensingRequestTopic enum string for
--     structured licensing notes (source of truth for the daily digest grouping)
--   * lc_digest_runs: idempotency ledger for the daily digest cron

ALTER TABLE "new_business_notes"
  ADD COLUMN IF NOT EXISTS "tevah_verified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "licensing_notes"
  ADD COLUMN IF NOT EXISTS "purpose" TEXT;

CREATE TABLE IF NOT EXISTS "lc_digest_runs" (
  "id" TEXT NOT NULL,
  "digest_date" TEXT NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email_ok" BOOLEAN NOT NULL DEFAULT false,
  "discord_ok" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "lc_digest_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lc_digest_runs_digest_date_key"
  ON "lc_digest_runs"("digest_date");
