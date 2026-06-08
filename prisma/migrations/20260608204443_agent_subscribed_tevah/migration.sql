-- LC-tracked: timestamp the agent was subscribed to the Tevah carrier
-- platform. Owned by the licensing coordinator; not part of the agent's
-- phase checklist. Null means not yet subscribed.
ALTER TABLE "agent_profiles"
  ADD COLUMN IF NOT EXISTS "subscribed_to_tevah_at" TIMESTAMP(3);
