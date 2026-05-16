-- The editable daily-motivation library. Rows are seeded once from the
-- static MOTIVATION_SEED (src/lib/motivation-quotes.ts) on first run;
-- after that the vault editor owns the content. The weekday cron picks
-- one active row deterministically by date.

CREATE TABLE IF NOT EXISTS "motivation_quotes" (
  "id"         TEXT NOT NULL,
  "text"       TEXT NOT NULL,
  "voice"      TEXT NOT NULL DEFAULT 'classic',
  "attribution" TEXT,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "sort_key"   INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "motivation_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "motivation_quotes_active_sort_key_created_at_idx"
  ON "motivation_quotes" ("active", "sort_key", "created_at");
