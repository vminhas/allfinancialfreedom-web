-- Audit log for collaborative New Business submissions. Distinct from
-- the conversation thread (new_business_notes) so admins can scan
-- "who did what when" — added a split agent, flipped status, removed
-- a collaborator — without scrolling past chat. Drives the Activity
-- tab in the policy drawer.

CREATE TABLE IF NOT EXISTS "new_business_submission_activity" (
  "id"                   TEXT PRIMARY KEY,
  "submissionId"         TEXT NOT NULL,
  -- Either actor field can be set; both null = system event.
  "actorAgentProfileId"  TEXT,
  "actorAdminId"         TEXT,
  -- Dotted-style kind. CREATED, SPLIT_ADDED, SPLIT_REMOVED,
  -- STATUS_CHANGED, OTHER. Plain string so we don't need a migration
  -- to add a new event class later.
  "kind"                 TEXT NOT NULL,
  -- Free-form context — whose split was set/removed, what status
  -- went from-and-to, etc. Inspected in the UI to render readable
  -- copy.
  "metaJson"             JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nb_activity_submission_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "new_business_submissions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nb_activity_agent_fkey"
    FOREIGN KEY ("actorAgentProfileId") REFERENCES "agent_profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "nb_activity_admin_fkey"
    FOREIGN KEY ("actorAdminId") REFERENCES "admin_users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "nb_activity_submission_createdAt_idx"
  ON "new_business_submission_activity" ("submissionId", "createdAt");
