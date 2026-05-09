-- Articles must be admin-reviewed before they surface on an agent's
-- portal. Default DRAFT, admins flip to PUBLISHED (or REJECTED if
-- the AI output is unusable). Existing rows are backfilled to
-- PUBLISHED to avoid hiding articles that were already live.

CREATE TYPE "AgentArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED');

ALTER TABLE "agent_articles"
  ADD COLUMN "status"        "AgentArticleStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "reviewedById"  TEXT,
  ADD COLUMN "reviewedAt"    TIMESTAMP(3),
  ADD COLUMN "publishedAt"   TIMESTAMP(3);

-- Backfill anything that already exists as PUBLISHED so we don't
-- silently hide articles agents have already seen.
UPDATE "agent_articles" SET "status" = 'PUBLISHED', "publishedAt" = "generatedAt" WHERE "status" = 'DRAFT';

CREATE INDEX "agent_articles_status_idx" ON "agent_articles"("status");
