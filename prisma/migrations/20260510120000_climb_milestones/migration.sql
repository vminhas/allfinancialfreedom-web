-- The Climb: lifetime points-based achievement system. New tables
-- ClimbMilestone (admin-configurable definitions), ClimbAchievement
-- (per-agent earn record, unique per (agent, milestone) for
-- idempotent recompute), and AgentArticle (the marquee AI-generated
-- profile reward). Lifetime points themselves stay computed on the
-- fly from NewBusinessSubmission.points; no points ledger.

CREATE TYPE "ClimbRewardType" AS ENUM ('BADGE', 'DISCORD_CALLOUT', 'ARTICLE', 'CUSTOM');

CREATE TABLE "climb_milestones" (
  "id"             TEXT NOT NULL,
  "pointThreshold" INTEGER NOT NULL,
  "title"          TEXT NOT NULL,
  "tagline"        TEXT,
  "description"    TEXT,
  "rewardType"     "ClimbRewardType" NOT NULL,
  "rewardPayload"  JSONB,
  "iconKey"        TEXT,
  "accentColor"    TEXT,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "order"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "climb_milestones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "climb_milestones_pointThreshold_key"
  ON "climb_milestones"("pointThreshold");

CREATE TABLE "climb_achievements" (
  "id"                  TEXT NOT NULL,
  "agentProfileId"      TEXT NOT NULL,
  "milestoneId"         TEXT NOT NULL,
  "achievedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pointsAtAchievement" INTEGER NOT NULL,
  CONSTRAINT "climb_achievements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "climb_achievements_agentProfileId_fkey"
    FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "climb_achievements_milestoneId_fkey"
    FOREIGN KEY ("milestoneId") REFERENCES "climb_milestones"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "climb_achievements_agent_milestone_key"
  ON "climb_achievements"("agentProfileId", "milestoneId");
CREATE INDEX "climb_achievements_agentProfileId_idx"
  ON "climb_achievements"("agentProfileId");
CREATE INDEX "climb_achievements_achievedAt_idx"
  ON "climb_achievements"("achievedAt");

CREATE TABLE "agent_articles" (
  "id"             TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "milestoneId"    TEXT,
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "promptUsed"     TEXT,
  "modelId"        TEXT,
  "inputTokens"    INTEGER,
  "outputTokens"   INTEGER,
  "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_articles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_articles_agentProfileId_fkey"
    FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE
);

CREATE INDEX "agent_articles_agentProfileId_generatedAt_idx"
  ON "agent_articles"("agentProfileId", "generatedAt");

-- Seed starter milestones. Admins can edit / deactivate / extend
-- via /vault/climb without a deploy.
INSERT INTO "climb_milestones" ("id", "pointThreshold", "title", "tagline", "description", "rewardType", "rewardPayload", "iconKey", "accentColor", "active", "order", "updatedAt") VALUES
  ('seed_climb_1k',   1000,   'On the Board',         'First thousand points logged.',                         'You crossed the first thousand-point line. The journey starts here.',                                                                  'DISCORD_CALLOUT', '{"embedTitle":"On the Board","embedDescription":"Just hit their first 1,000 points on the Climb."}', '◐', '#8B6F2E',  true, 1, CURRENT_TIMESTAMP),
  ('seed_climb_5k',   5000,   'Five-Figure Foundation','Five thousand points. The base is built.',              'You''ve put real production on the board. The next ranks unlock from here.',                                                           'BADGE',           '{"key":"FIRST_STEPS","label":"First Steps","icon":"◯","accentColor":"#A88C44"}',                  '◯', '#A88C44',  true, 2, CURRENT_TIMESTAMP),
  ('seed_climb_15k',  15000,  'Mid-Climb',            'Fifteen thousand. You''re moving.',                      'You''re halfway to Producer. The Climb is real.',                                                                                       'DISCORD_CALLOUT', '{"embedTitle":"Mid-Climb","embedDescription":"Just hit 15K on the Climb."}',                       '◑', '#C9A96E',  true, 3, CURRENT_TIMESTAMP),
  ('seed_climb_25k',  25000,  'Producer',             'Twenty-five thousand points. Producer status.',          'You earn the Producer badge. This shows on your portal and Discord profile.',                                                          'BADGE',           '{"key":"PRODUCER","label":"Producer","icon":"◆","accentColor":"#D4AF37"}',                          '◆', '#D4AF37',  true, 4, CURRENT_TIMESTAMP),
  ('seed_climb_45k',  45000,  'Marketing Director',   'Phase 4 threshold. Forty-five thousand.',                'Same threshold the leadership track unlocks at. The Climb celebrates the moment.',                                                     'DISCORD_CALLOUT', '{"embedTitle":"Marketing Director Threshold","embedDescription":"Hit 45K on the Climb. MD threshold cleared."}', '✦', '#E0BC52', true, 5, CURRENT_TIMESTAMP),
  ('seed_climb_75k',  75000,  'Three-Quarter Mark',   'Seventy-five thousand. Within striking distance.',       'You can see the summit from here. The hardest twenty-five is the next twenty-five.',                                                   'DISCORD_CALLOUT', '{"embedTitle":"Three-Quarter Mark","embedDescription":"Just hit 75K on the Climb."}',              '✧', '#EFD27A',  true, 6, CURRENT_TIMESTAMP),
  ('seed_climb_100k', 100000, 'Six-Figure Climber',   'One hundred thousand points. A personalized article is written about you.', 'AFF generates a personalized article celebrating the journey you''ve been on. Your story, your stats, your moments. Posted to your portal and shared in Discord.', 'ARTICLE', '{"promptTemplate":""}',                                                                              '🏔️', '#F2D17B',  true, 7, CURRENT_TIMESTAMP),
  ('seed_climb_150k', 150000, 'Summit',               'One hundred and fifty thousand. The Summit.',            'Phase 5 EMD threshold. The peak of the Climb. Summit badge + a second personalized article.',                                          'BADGE',           '{"key":"SUMMIT","label":"Summit","icon":"🏔️","accentColor":"#FFD700"}',                            '🏔️', '#FFD700',  true, 8, CURRENT_TIMESTAMP);
