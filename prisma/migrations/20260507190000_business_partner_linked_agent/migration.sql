-- Eager link from BusinessPartner to the AgentProfile a contact eventually
-- became (matched by email). Lets the writing agent surface their recruit's
-- NPN / license number on the contact card without asking them every time.
-- Nullable: most BPs are not AFF agents and never will be.

ALTER TABLE "business_partners"
  ADD COLUMN "linkedAgentProfileId" TEXT;

CREATE INDEX "business_partners_linkedAgentProfileId_idx"
  ON "business_partners" ("linkedAgentProfileId");

ALTER TABLE "business_partners"
  ADD CONSTRAINT "business_partners_linkedAgentProfileId_fkey"
  FOREIGN KEY ("linkedAgentProfileId")
  REFERENCES "agent_profiles" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: any existing BP whose email (case-insensitive) matches an
-- AgentUser's email gets linked to that AgentUser's AgentProfile. Keeps
-- already-onboarded recruits' NPNs visible immediately on rollout instead
-- of requiring a re-import or manual relink.
UPDATE "business_partners" bp
   SET "linkedAgentProfileId" = ap."id"
  FROM "agent_profiles" ap
  JOIN "agent_users" au ON au."id" = ap."agentUserId"
 WHERE bp."email" IS NOT NULL
   AND LOWER(bp."email") = LOWER(au."email")
   AND bp."linkedAgentProfileId" IS NULL;
