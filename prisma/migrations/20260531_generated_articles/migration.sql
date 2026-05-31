-- Auto-generated blog articles drafted by the weekly Opus 4.8 cron.
-- Published rows are read alongside content/blog/*.mdx files on the
-- public blog so a publish does not need a redeploy.
CREATE TABLE IF NOT EXISTS "generated_articles" (
  "id"              TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "category"        TEXT NOT NULL,
  "excerpt"         TEXT NOT NULL,
  "coverImage"      TEXT NOT NULL,
  "tags"            TEXT[] NOT NULL DEFAULT '{}',
  "mdx_body"        TEXT NOT NULL,
  "source_urls"     TEXT[] NOT NULL DEFAULT '{}',
  "related_slugs"   TEXT[] NOT NULL DEFAULT '{}',
  "status"          TEXT NOT NULL DEFAULT 'DRAFT',
  "auto_publish_at" TIMESTAMP(3),
  "published_at"    TIMESTAMP(3),
  "rejected_reason" TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generated_articles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "generated_articles_slug_key" ON "generated_articles"("slug");
CREATE INDEX IF NOT EXISTS "generated_articles_status_created_at_idx" ON "generated_articles"("status", "created_at");
CREATE INDEX IF NOT EXISTS "generated_articles_status_auto_publish_at_idx" ON "generated_articles"("status", "auto_publish_at");
