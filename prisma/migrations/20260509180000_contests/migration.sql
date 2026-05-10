-- Time-boxed bonus contests (e.g. "$500 Fast Start Bonus, 60 days
-- from ICA"). Each contest has a per-agent window anchored to a
-- date on AgentProfile (icaDate / createdAt / phaseStartedAt) plus
-- a duration, OR a fixed window for everyone.
--
-- Most requirements compute on the fly from existing data
-- (phase items, milestones, business partners, new business
-- submissions). MANUAL requirements get a row in
-- contest_manual_checks so admins can tick them per-agent.

CREATE TYPE "ContestAnchor" AS ENUM ('ICA_DATE', 'ONBOARDING', 'PHASE_START', 'FIXED');

CREATE TYPE "ContestRequirementType" AS ENUM (
  'PHASE_ITEM',
  'MILESTONE',
  'RECRUITS',
  'POLICIES',
  'MANUAL',
  'CUSTOM_TEXT'
);

CREATE TABLE "contests" (
  "id"             TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "rewardAmount"   INTEGER,
  "rewardLabel"    TEXT,
  "anchor"         "ContestAnchor" NOT NULL,
  "durationDays"   INTEGER,
  "fixedStartAt"   TIMESTAMP(3),
  "fixedEndAt"     TIMESTAMP(3),
  "eligibleFromAt" TIMESTAMP(3),
  "eligibleToAt"   TIMESTAMP(3),
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contests_active_idx" ON "contests"("active");

CREATE TABLE "contest_requirements" (
  "id"           TEXT NOT NULL,
  "contestId"    TEXT NOT NULL,
  "order"        INTEGER NOT NULL,
  "label"        TEXT NOT NULL,
  "type"         "ContestRequirementType" NOT NULL,
  "phaseItemKey" TEXT,
  "milestoneKey" TEXT,
  "count"        INTEGER,
  CONSTRAINT "contest_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contest_requirements_contestId_fkey"
    FOREIGN KEY ("contestId") REFERENCES "contests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "contest_requirements_contestId_idx" ON "contest_requirements"("contestId");

CREATE TABLE "contest_manual_checks" (
  "id"             TEXT NOT NULL,
  "contestId"      TEXT NOT NULL,
  "requirementId"  TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "completed"      BOOLEAN NOT NULL DEFAULT false,
  "completedAt"    TIMESTAMP(3),
  "checkedById"    TEXT,
  "notes"          TEXT,
  CONSTRAINT "contest_manual_checks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contest_manual_checks_contestId_fkey"
    FOREIGN KEY ("contestId") REFERENCES "contests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contest_manual_checks_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "contest_requirements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contest_manual_checks_agentProfileId_fkey"
    FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contest_manual_checks_requirementId_agentProfileId_key"
  ON "contest_manual_checks"("requirementId", "agentProfileId");

CREATE INDEX "contest_manual_checks_agentProfileId_idx"
  ON "contest_manual_checks"("agentProfileId");
