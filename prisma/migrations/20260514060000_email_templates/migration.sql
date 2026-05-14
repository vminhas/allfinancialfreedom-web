-- Extend the existing email_templates stub into a full template
-- system. EmailSender + GhlWebhookEvent are new tables; the existing
-- email_templates gets new columns + an index.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so a re-run is safe, and the
-- senders/webhook-events tables are created only when missing.

CREATE TABLE IF NOT EXISTS "email_senders" (
  "id"         TEXT PRIMARY KEY,
  "key"        TEXT UNIQUE NOT NULL,
  "name"       TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "role"       TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

-- The existing email_templates table only had id/key/label/subject/
-- bodyHtml/description/createdAt/updatedAt. Add the rest of the new
-- system's columns.
ALTER TABLE "email_templates"
  ADD COLUMN IF NOT EXISTS "event_type"  TEXT,
  ADD COLUMN IF NOT EXISTS "recipient"   TEXT NOT NULL DEFAULT 'CONTACT',
  ADD COLUMN IF NOT EXISTS "internal_to" TEXT,
  ADD COLUMN IF NOT EXISTS "filter_json" JSONB,
  ADD COLUMN IF NOT EXISTS "sender_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "enabled"     BOOLEAN NOT NULL DEFAULT true;

-- Rename existing column bodyHtml -> body_html if the camelCase name
-- is still present. Postgres allows running this idempotently by
-- checking column existence first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'bodyHtml'
  ) THEN
    ALTER TABLE "email_templates" RENAME COLUMN "bodyHtml" TO "body_html";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'email_templates' AND constraint_name = 'email_templates_sender_id_fkey'
  ) THEN
    -- already present
  ELSE
    ALTER TABLE "email_templates"
      ADD CONSTRAINT "email_templates_sender_id_fkey"
      FOREIGN KEY ("sender_id") REFERENCES "email_senders"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "email_templates_event_type_enabled_idx"
  ON "email_templates"("event_type", "enabled");

CREATE TABLE IF NOT EXISTS "ghl_webhook_events" (
  "id"                TEXT PRIMARY KEY,
  "event_type"        TEXT NOT NULL,
  "contact_id"        TEXT,
  "contact_email"     TEXT,
  "payload"           JSONB NOT NULL,
  "received_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "templates_fired"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "templates_skipped" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "error"             TEXT
);

CREATE INDEX IF NOT EXISTS "ghl_webhook_events_event_type_received_idx"
  ON "ghl_webhook_events"("event_type", "received_at" DESC);
CREATE INDEX IF NOT EXISTS "ghl_webhook_events_received_idx"
  ON "ghl_webhook_events"("received_at" DESC);
