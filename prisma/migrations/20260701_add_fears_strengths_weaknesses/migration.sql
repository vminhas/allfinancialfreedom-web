-- Add fears, strengths, weaknesses to PersonalFinancialReview
-- for the standalone Goal Setting page.
ALTER TABLE "personal_financial_reviews"
  ADD COLUMN "fears"      JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "strengths"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "weaknesses" JSONB NOT NULL DEFAULT '[]';

-- Wire Goal Setting checklist item to the new /agents/goals page.
UPDATE "phase_item_definitions"
  SET "actionJson" = '{"type":"navigate-tab","tab":"goals","label":"Open Goals"}'
  WHERE "itemKey" = 'goal_setting';
