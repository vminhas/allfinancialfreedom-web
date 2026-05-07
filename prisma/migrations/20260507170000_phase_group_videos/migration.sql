-- Add an optional banner-videos column to PhaseGroupDefinition.
-- Used by Melinee's "Welcome to Step N" videos (and any future
-- per-step content) shown at the top of each step on the agent
-- dashboard. JSON array of { url, title } entries; empty array
-- means no video.
ALTER TABLE "phase_group_definitions"
  ADD COLUMN IF NOT EXISTS "videos" JSONB NOT NULL DEFAULT '[]'::jsonb;
