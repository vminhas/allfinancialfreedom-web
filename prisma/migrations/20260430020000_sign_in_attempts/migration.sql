-- Audit log for unauthorized Google sign-in attempts. Successful
-- sign-ins are not duplicated here; AdminUser/AgentUser.lastLoginAt
-- is the source of truth for those.
CREATE TABLE "sign_in_attempts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sign_in_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sign_in_attempts_createdAt_idx" ON "sign_in_attempts" ("createdAt");
CREATE INDEX "sign_in_attempts_email_idx" ON "sign_in_attempts" ("email");
