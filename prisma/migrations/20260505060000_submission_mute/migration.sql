-- Per-policy mute for collaborative New Business threads.
--
-- An agent (writer or split) can mute a specific submission to stop
-- Discord DMs about new comments on it. The in-app notification row
-- still gets written so they can find what they missed in the bell
-- inbox and toasts when they're actively in-portal — only the
-- out-of-band Discord ping is suppressed.

CREATE TABLE IF NOT EXISTS "new_business_submission_mutes" (
  "id"             TEXT PRIMARY KEY,
  "submissionId"   TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nb_mute_submission_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "new_business_submissions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nb_mute_agent_fkey"
    FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "nb_mute_submission_agent_unique"
  ON "new_business_submission_mutes" ("submissionId", "agentProfileId");
