-- defaultCompleted on ContestRequirement: when true, MANUAL
-- requirements evaluate as completed for any agent without an
-- explicit check row. Used for 'implicit-true' requirements like
-- 'Get GFI Code' where every portal user already qualifies and we
-- shouldn't keep bulk-ticking new joiners forever.

ALTER TABLE "contest_requirements"
  ADD COLUMN "defaultCompleted" BOOLEAN NOT NULL DEFAULT false;
