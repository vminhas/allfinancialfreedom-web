CREATE TABLE "goal_snapshots" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "goals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "goal_snapshots_agentProfileId_createdAt_idx" ON "goal_snapshots"("agentProfileId", "createdAt");

ALTER TABLE "goal_snapshots" ADD CONSTRAINT "goal_snapshots_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
