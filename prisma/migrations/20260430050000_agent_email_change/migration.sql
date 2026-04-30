-- Self-serve email change with verification.
ALTER TABLE "agent_users"
  ADD COLUMN "pendingEmail"        TEXT,
  ADD COLUMN "pendingEmailToken"   TEXT,
  ADD COLUMN "pendingEmailExpires" TIMESTAMP(3),
  ADD COLUMN "lastEmailChangeAt"   TIMESTAMP(3);

CREATE UNIQUE INDEX "agent_users_pendingEmailToken_key"
  ON "agent_users" ("pendingEmailToken");
