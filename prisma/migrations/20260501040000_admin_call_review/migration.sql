-- Persist standalone coaching-tool reviews authored by admins.
-- Separate from call_reviews (which require a CallLog) so admins can
-- track their own progress against the same 6-dimension AFF rubric
-- their agents are scored against.

CREATE TABLE "admin_call_reviews" (
  "id"                 TEXT NOT NULL,
  "adminUserId"        TEXT NOT NULL,

  "contactName"        TEXT,
  "callDate"           TIMESTAMP(3) NOT NULL,
  "callTranscript"     TEXT NOT NULL,

  "overallScore"       INTEGER NOT NULL,
  "rubricScores"       JSONB NOT NULL,
  "strengths"          JSONB NOT NULL,
  "weaknesses"         JSONB NOT NULL,
  "coachingTips"       JSONB NOT NULL,
  "nextSteps"          JSONB NOT NULL,
  "summary"            TEXT NOT NULL,
  "notes"              TEXT,

  "modelId"            TEXT NOT NULL,
  "inputTokens"        INTEGER NOT NULL,
  "outputTokens"       INTEGER NOT NULL,
  "cacheReadTokens"    INTEGER NOT NULL DEFAULT 0,
  "cacheCreateTokens"  INTEGER NOT NULL DEFAULT 0,
  "reviewedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_call_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_call_reviews_adminUserId_reviewedAt_idx"
  ON "admin_call_reviews" ("adminUserId", "reviewedAt");

CREATE INDEX "admin_call_reviews_reviewedAt_idx"
  ON "admin_call_reviews" ("reviewedAt");

ALTER TABLE "admin_call_reviews"
  ADD CONSTRAINT "admin_call_reviews_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
