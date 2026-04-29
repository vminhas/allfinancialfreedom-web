-- Track CEO intro emails sent on behalf of an agent
ALTER TABLE "business_partners"
  ADD COLUMN "introSentAt" TIMESTAMP(3),
  ADD COLUMN "introMessageId" TEXT,
  ADD COLUMN "source" TEXT;
