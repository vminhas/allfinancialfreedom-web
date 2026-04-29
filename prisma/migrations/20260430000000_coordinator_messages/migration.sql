-- Threaded back-and-forth on coordinator requests so the LC can reply
-- without marking resolved.
CREATE TABLE "coordinator_messages" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coordinator_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coordinator_messages_requestId_createdAt_idx"
  ON "coordinator_messages" ("requestId", "createdAt");

ALTER TABLE "coordinator_messages"
  ADD CONSTRAINT "coordinator_messages_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "coordinator_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
