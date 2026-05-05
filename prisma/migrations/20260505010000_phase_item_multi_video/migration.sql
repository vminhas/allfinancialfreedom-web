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

ALTER TABLE "phase_item_definitions"
  ADD COLUMN "videos" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "phase_item_definitions"
   SET "videos" = jsonb_build_array(
         jsonb_build_object('url', "videoUrl", 'title', "videoTitle")
       )
 WHERE "videoUrl" IS NOT NULL
   AND "videoUrl" <> '';
