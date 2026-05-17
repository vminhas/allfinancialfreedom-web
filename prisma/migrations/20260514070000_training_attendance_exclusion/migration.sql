-- Agents who are no longer attending trainings (left the team, on
-- permanent leave, etc.). Every training auto-renders them red /
-- NOT_TRACKING so the admin doesn't have to mark them absent meeting
-- after meeting. An explicit per-event "present" override still wins
-- if they ever do show up.

CREATE TABLE IF NOT EXISTS "training_attendance_exclusions" (
  "id"              TEXT PRIMARY KEY,
  "agent_profile_id" TEXT NOT NULL UNIQUE
    REFERENCES "agent_profiles"("id") ON DELETE CASCADE,
  "reason"          TEXT,
  "created_by"      TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "training_attendance_exclusions_agent_idx"
  ON "training_attendance_exclusions"("agent_profile_id");
