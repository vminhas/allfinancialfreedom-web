-- CallLog gains a structured callType field (RECRUIT / FOLLOW_UP /
-- CLIENT_APPOINTMENT / OTHER) plus a free-text callTypeOther for the
-- OTHER case. Replaces the free-form 'result' column in the agent UI;
-- result column itself is kept on the row for back-compat with
-- historical data but no longer populated by new submissions.

CREATE TYPE "CallType" AS ENUM ('RECRUIT', 'FOLLOW_UP', 'CLIENT_APPOINTMENT', 'OTHER');

ALTER TABLE "call_logs" ADD COLUMN "callType"      "CallType";
ALTER TABLE "call_logs" ADD COLUMN "callTypeOther" TEXT;
