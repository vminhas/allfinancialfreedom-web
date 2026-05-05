-- Split-agent collaboration on PolicyEntry.
--
-- Adds:
--   * splitAgentId — optional FK to AgentProfile (the legacy
--     splitAgentName free-text column stays as a display fallback for
--     historical rows + non-AFF split partners).
--   * Denormalized "last comment" fields so the policies-list view can
--     render "VM · 2h ago: Got the underwriting back…" without an
--     N+1 fetch per row.
--
-- Plus three new tables:
--   * policy_comments — chat-style thread on each policy.
--   * policy_activity — audit log (added/removed splits, status
--     changes). Separate from comments so the conversation surface
--     stays clean.
--   * policy_views — per-agent, per-policy lastViewedAt for the
--     unread-dot indicator on the list view.

ALTER TABLE "policy_entries"
  ADD COLUMN IF NOT EXISTS "splitAgentId"        TEXT,
  ADD COLUMN IF NOT EXISTS "lastCommentAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCommentBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "lastCommentPreview"  VARCHAR(200);

CREATE INDEX IF NOT EXISTS "policy_entries_splitAgentId_idx"  ON "policy_entries" ("splitAgentId");
CREATE INDEX IF NOT EXISTS "policy_entries_lastCommentAt_idx" ON "policy_entries" ("lastCommentAt" DESC);

ALTER TABLE "policy_entries"
  ADD CONSTRAINT "policy_entries_splitAgentId_fkey"
  FOREIGN KEY ("splitAgentId") REFERENCES "agent_profiles" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "policy_comments" (
  "id"             TEXT PRIMARY KEY,
  "policyEntryId"  TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "editedAt"       TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "policy_comments_policyEntryId_fkey"
    FOREIGN KEY ("policyEntryId") REFERENCES "policy_entries" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_comments_agentProfileId_fkey"
    FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "policy_comments_policyEntryId_createdAt_idx"
  ON "policy_comments" ("policyEntryId", "createdAt");

CREATE TABLE IF NOT EXISTS "policy_activity" (
  "id"             TEXT PRIMARY KEY,
  "policyEntryId"  TEXT NOT NULL,
  "actorProfileId" TEXT,                              -- NULL = system
  "kind"           TEXT NOT NULL,                     -- ADDED_SPLIT | REMOVED_SPLIT | STATUS_CHANGED | OTHER
  "metaJson"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "policy_activity_policyEntryId_fkey"
    FOREIGN KEY ("policyEntryId") REFERENCES "policy_entries" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_activity_actorProfileId_fkey"
    FOREIGN KEY ("actorProfileId") REFERENCES "agent_profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "policy_activity_policyEntryId_idx"
  ON "policy_activity" ("policyEntryId");

CREATE TABLE IF NOT EXISTS "policy_views" (
  "id"             TEXT PRIMARY KEY,
  "policyEntryId"  TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "lastViewedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "muted"          BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "policy_views_policyEntryId_fkey"
    FOREIGN KEY ("policyEntryId") REFERENCES "policy_entries" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_views_agentProfileId_fkey"
    FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "policy_views_policyEntryId_agentProfileId_key"
  ON "policy_views" ("policyEntryId", "agentProfileId");
