-- Drop the legacy single-response columns from agent_feedback. The
-- previous migration (20260506000000_feedback_notes_thread) already
-- seeded their values into agent_feedback_notes, so all history is
-- preserved in the threaded conversation. The columns are unused by
-- application code at this point.

ALTER TABLE "agent_feedback" DROP COLUMN IF EXISTS "responseToAgent";
ALTER TABLE "agent_feedback" DROP COLUMN IF EXISTS "adminNotes";
