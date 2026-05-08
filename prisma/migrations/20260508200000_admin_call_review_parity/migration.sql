-- AdminCallReview gains the same context fields the agent-side CallLog
-- captures, so admins reviewing their own call transcripts can record
-- the same shape of metadata (phone, subject, call type, follow-up
-- flag) the agents log from the field. Sets up reporting to UNION the
-- two tables for a unified call history later.

ALTER TABLE "admin_call_reviews"
  ADD COLUMN "phoneNumber"     TEXT,
  ADD COLUMN "subject"         TEXT,
  ADD COLUMN "callType"        "CallType",
  ADD COLUMN "callTypeOther"   TEXT,
  ADD COLUMN "followUpNeeded"  BOOLEAN NOT NULL DEFAULT false;
