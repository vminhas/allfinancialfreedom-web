-- Allow multiple walkthrough videos per checklist item.
--
-- The legacy single-video columns ("videoUrl" / "videoTitle") stay for now so
-- any old code path that hasn't been updated still has data to read; new code
-- reads from `videos` (an ordered JSON array of {url, title} objects). When
-- writing through the admin route we mirror videos[0] back into the legacy
-- columns so the two stay in sync until we drop them in a future migration.
--
-- Note: the "videoUrl" / "videoTitle" identifiers are intentionally
-- double-quoted camelCase. Those columns were created without a Prisma @map
-- directive, so their actual Postgres names match the field names verbatim.
-- An earlier version of this migration referenced them as "video_url" /
-- "video_title" and the production deploy failed with "column does not
-- exist". Don't rename without checking.

-- IF NOT EXISTS because the first deploy attempt committed the ADD
-- COLUMN before failing on the broken UPDATE below; on retry the column
-- is already there and a plain ADD COLUMN would error with 42701
-- (duplicate_column). Idempotent ADD makes this migration safe to run on
-- any DB state: fresh, partially-applied, or fully-applied.
ALTER TABLE "phase_item_definitions"
  ADD COLUMN IF NOT EXISTS "videos" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from the legacy single-video columns. Idempotent: rewriting
-- the same payload to videos is a no-op even if the row was previously
-- backfilled. Only updates rows where the array is still empty so that
-- any rows already populated by the new admin route (post-deploy) don't
-- get clobbered.
UPDATE "phase_item_definitions"
   SET "videos" = jsonb_build_array(
         jsonb_build_object('url', "videoUrl", 'title', "videoTitle")
       )
 WHERE "videoUrl" IS NOT NULL
   AND "videoUrl" <> ''
   AND ("videos" IS NULL OR "videos" = '[]'::jsonb);
