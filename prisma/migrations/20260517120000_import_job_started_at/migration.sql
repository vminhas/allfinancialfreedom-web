-- Heartbeat for stale-lock recovery on import jobs.
--
-- A large PropHog import ran in one serverless request, exceeded the
-- function timeout, and was killed before it could write a terminal
-- status. The job stayed status='RUNNING' forever and the "already
-- running" guard wedged every retry. startedAt is refreshed on each
-- processing chunk so a RUNNING job whose heartbeat is stale can be
-- safely taken over and resumed.
ALTER TABLE "import_jobs" ADD COLUMN "startedAt" TIMESTAMP(3);
