-- CallScript: AFF coaching scripts the AI grades transcripts against
-- per CallType. Lets us standardize what every agent should be saying
-- on a recruit call vs. an FTA vs. a client appointment, instead of
-- everyone running their own version. Admin-managed via
-- /vault/coaching/scripts so non-engineers can edit script content.
--
-- Activating one script for a CallType deactivates the previous active
-- one (handled in the API layer; we don't enforce it here so historical
-- rows aren't rejected on backfill).

CREATE TABLE "call_scripts" (
  "id"          TEXT NOT NULL,
  "callType"    "CallType" NOT NULL,
  "name"        TEXT NOT NULL,
  "content"     TEXT NOT NULL,
  "resourceUrl" TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "call_scripts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "call_scripts_callType_active_idx"
  ON "call_scripts"("callType", "active");

-- Seed a placeholder script per CallType so the AI has something to
-- grade against from day one. Admins paste real deck content (Canva
-- hiring deck, FTA Slides deck, etc.) via /vault/coaching/scripts.
-- Marked active=true so reviewTranscript() picks them up; replacing
-- one is a single UPDATE through the admin UI.
INSERT INTO "call_scripts" ("id", "callType", "name", "content", "resourceUrl", "active", "createdAt", "updatedAt") VALUES
  ('seed_script_recruit', 'RECRUIT',            'AFF Hiring Presentation',  'Placeholder for the AFF Hiring deck. Paste the script outline (Canva deck content) here so the AI can grade recruiting calls against it. The Connection / Engagement / Transition / Presentation / Commitment NEPQ structure still applies on top of this.', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_script_fta',     'CLIENT_APPOINTMENT', 'AFF FTA Field Visit Deck', 'Placeholder for the AFF FTA Field Visit deck. Paste the script outline (Google Slides content) here so the AI can grade client appointments against it. The Connection / Engagement / Transition / Presentation / Commitment NEPQ structure still applies on top of this.', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_script_followup','FOLLOW_UP',          'AFF Follow-up Call Script', 'Placeholder for the AFF follow-up call script. Paste the script outline here (touchpoint cadence, value-add angles, recap framing) so the AI can grade follow-up calls against it.', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_script_other',   'OTHER',              'AFF General Call Script',   'Placeholder for ad-hoc / other calls. Generic NEPQ-aligned outline. Edit or deactivate via /vault/coaching/scripts.', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
