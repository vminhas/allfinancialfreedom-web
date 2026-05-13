-- Backfill post_to_announcements = true for the milestone items that
-- the CEO expects to celebrate publicly in #announcements: Senior
-- Associate Promotion (gated by admin approval), EMD Sign-Off (same),
-- and the agent's first $1,000 (net-license milestone). The column
-- defaults to false (see 20260505000000_phase_item_notifications) so
-- without this backfill the SA Promotion box ticks silently in
-- announcements even though it fires the activity-channel embed. We
-- only update rows that exist; nothing is created.

UPDATE "phase_item_definitions"
   SET "post_to_announcements" = true
 WHERE "item_key" IN ('associate_promotion', 'emd_signoff', 'first_1000');
