-- Persist resolved Zoom-display-name / Zoom-email aliases so the
-- attendance matcher learns permanently. Append-only: each alias is
-- its own row, so an agent who's been "Sadie's iPhone", "Mercedes
-- Grubb", and "Sadie Grubb" over time has three rows pointing at the
-- same agentProfileId.

CREATE TABLE "agent_zoom_aliases" (
  "id"              TEXT NOT NULL,
  "agentProfileId"  TEXT NOT NULL,

  "nameKey"         TEXT,
  "email"           TEXT,
  "rawDisplayName"  TEXT,

  "source"          TEXT NOT NULL DEFAULT 'orphan_resolve',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_zoom_aliases_pkey" PRIMARY KEY ("id")
);

-- Postgres unique-on-nullable keeps unrelated rows from colliding:
-- two rows with email=NULL but different nameKey values are fine.
CREATE UNIQUE INDEX "agent_zoom_aliases_nameKey_key"
  ON "agent_zoom_aliases" ("nameKey");

CREATE UNIQUE INDEX "agent_zoom_aliases_email_key"
  ON "agent_zoom_aliases" ("email");

CREATE INDEX "agent_zoom_aliases_agentProfileId_idx"
  ON "agent_zoom_aliases" ("agentProfileId");

ALTER TABLE "agent_zoom_aliases"
  ADD CONSTRAINT "agent_zoom_aliases_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
