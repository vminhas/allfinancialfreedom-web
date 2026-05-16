-- One-time copy refresh for the daily-motivation library.
--
-- PR #206 seeds motivation_quotes once and then never re-syncs from the
-- file so vault edits are never clobbered. That protection also means a
-- copy fix in src/lib/motivation-quotes.ts does NOT reach an already
-- seeded database on its own. This migration carries the 14 reworded
-- lines across.
--
-- Safety: each UPDATE matches on the EXACT prior text. If the CEO has
-- already rewritten one of these lines in /vault/motivation, its text no
-- longer matches and that row is left exactly as the CEO set it. On a
-- fresh environment that seeded from the updated file the old text does
-- not exist, so every statement is a harmless no-op. Idempotent either
-- way.

UPDATE "motivation_quotes"
SET "text" = 'You are closer than it feels, and the only thing that adds distance is stopping.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'You are closer than it feels and further than you will be if you stop.';

UPDATE "motivation_quotes"
SET "text" = 'The goal stops feeling like a climb the moment you decide to be someone who climbs.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'Goals are downhill once you decide who is doing the climbing.';

UPDATE "motivation_quotes"
SET "text" = 'Discipline feels like a price today and like freedom a year from now. Pay it.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'Discipline tastes like discipline today and like freedom in a year.';

UPDATE "motivation_quotes"
SET "text" = 'Your calendar already knows whether you are serious. Make it say yes.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'Your goals can read your calendar. Make sure it inspires them.';

UPDATE "motivation_quotes"
SET "text" = 'Fear is renting space in your head and it never pays. Evict it with one call.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'The fear is renting space in your head. Charge it in commissions and evict it with action.';

UPDATE "motivation_quotes"
SET "text" = 'Nobody hears your standards. They only see your actions. Make those loud.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'Your standard is the speech. Your actions are the audience. Make it loud.';

UPDATE "motivation_quotes"
SET "text" = 'You do not have a time problem. You have a priority you have not made non-negotiable. Fix that and the time appears.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'You do not have a time problem. You have a priority that has not been made non-negotiable yet.';

UPDATE "motivation_quotes"
SET "text" = 'You are not chasing your goals. You are becoming the person who already reached them. Move like it.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'You are not behind your goals. You are early to the version of you that reaches them.';

UPDATE "motivation_quotes"
SET "text" = 'The work pays quietly for a long time, then all at once. Stay until the all at once.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'The work whispers before it pays. Keep listening and keep going.';

UPDATE "motivation_quotes"
SET "text" = 'Take the excuse off the table and watch how fast you find a way.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'Burn the boats on the excuse and watch how creative you get.';

UPDATE "motivation_quotes"
SET "text" = 'Commit so hard to serving that doubt never gets the floor.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'Be too committed to serve to have time to doubt.';

UPDATE "motivation_quotes"
SET "text" = 'Outwork the version of you that wanted to stop, and do not look back.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'Take souls. Outwork the version of you that wanted to stop and never look back.';

UPDATE "motivation_quotes"
SET "text" = 'The dream is rent, due every single day. Pay it early and the day is yours.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'The dream is rent and it is due every single day. Pay it before the day pays you.';

UPDATE "motivation_quotes"
SET "text" = 'Studying the call is not making the call. Go make it.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "text" = 'The map is not the territory. Stop studying the call and go walk into it.';
