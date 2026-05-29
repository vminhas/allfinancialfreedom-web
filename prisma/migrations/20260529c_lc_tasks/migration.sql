-- Licensing Coordinator task list. Recurring SOP steps + ad-hoc tasks
-- the LC checks off; completions feed the nightly digest.
CREATE TABLE IF NOT EXISTS "lc_tasks" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "recurring" BOOLEAN NOT NULL DEFAULT false,
  "completed_on" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lc_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "lc_tasks_recurring_sort_order_idx" ON "lc_tasks"("recurring", "sort_order");
CREATE INDEX IF NOT EXISTS "lc_tasks_completed_on_idx" ON "lc_tasks"("completed_on");
