-- Admin-set block flag on AgentProfile to stop a spamming referrer.
-- When non-null, the agent cannot submit new referrals via /api/agents/referrals.
ALTER TABLE "agent_profiles" ADD COLUMN IF NOT EXISTS "referrals_blocked_at" TIMESTAMP(3);
ALTER TABLE "agent_profiles" ADD COLUMN IF NOT EXISTS "referrals_blocked_reason" TEXT;
