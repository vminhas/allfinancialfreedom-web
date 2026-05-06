-- Unified in-app notification table. Every agent-targeted alert
-- (feedback responses, policy comments, training reminders,
-- announcements, promotions) writes one row here. The SSE stream at
-- /api/agents/notifications/stream watches this table and pushes
-- new rows to the recipient's open client(s) in near-real-time, plus
-- the createNotification() helper in src/lib/notify.ts can fan out
-- a Discord DM in the same call.
--
-- Recipient is always an AgentProfile in v1. Admins still get their
-- own notifications via DISCORD_ADMIN_CHANNEL_ID; we can extend
-- this to admin recipients later by adding recipientUserType.

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"                       TEXT PRIMARY KEY,
  "recipientAgentProfileId"  TEXT NOT NULL,
  -- Dotted event identifier, e.g. 'feedback.response',
  -- 'policy.comment', 'training.reminder'. Used by the client
  -- dispatcher to decide what to do with the event (toast, refetch,
  -- insert into thread, etc.) and by the per-event mute UI.
  "kind"                     TEXT NOT NULL,
  -- Type + id of the related entity so deep links resolve. e.g.
  -- subjectType='feedback', subjectId=<feedback row id>. Nullable
  -- for general announcements that don't have a subject.
  "subjectType"              TEXT NOT NULL,
  "subjectId"                TEXT,
  "title"                    TEXT NOT NULL,
  "body"                     TEXT,
  "linkUrl"                  TEXT,
  "color"                    INTEGER,                                  -- hex int for embed accents
  "readAt"                   TIMESTAMP(3),
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_recipientAgentProfileId_fkey"
    FOREIGN KEY ("recipientAgentProfileId") REFERENCES "agent_profiles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "notifications_recipient_createdAt_idx"
  ON "notifications" ("recipientAgentProfileId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "notifications_recipient_readAt_idx"
  ON "notifications" ("recipientAgentProfileId", "readAt");
