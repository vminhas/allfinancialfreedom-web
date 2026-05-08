-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('RECRUITED', 'APPOINTMENT_BOOKED', 'POLICY_CLOSED', 'FOLLOW_UP_SCHEDULED', 'NOT_INTERESTED', 'NO_CONTACT');

-- AlterTable: add outcome to call_logs
ALTER TABLE "call_logs" ADD COLUMN "outcome" "CallOutcome";

-- AlterTable: add scoreBoosters to call_reviews
ALTER TABLE "call_reviews" ADD COLUMN "scoreBoosters" JSONB;

-- AlterTable: add scoreBoosters to admin_call_reviews
ALTER TABLE "admin_call_reviews" ADD COLUMN "scoreBoosters" JSONB;
