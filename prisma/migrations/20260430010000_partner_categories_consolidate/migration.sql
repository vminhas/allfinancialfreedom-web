-- Consolidate the partner-category dropdown from 5 options to 3:
-- recruit / business_partner / fta_contact. The two market segments
-- (life_market 28-50, rollover_market 50+) were age-bucket nuances
-- the agents kept asking us to clarify; collapsing them removes a
-- decision the agent doesn't actually need to make at classify time.
--
-- Mapping:
--   life_market    -> business_partner   (younger leads tend toward recruiting / cross-sell)
--   rollover_market -> fta_contact       (50+ retirement money is the textbook FTA conversation)
--
-- Anyone who wants the old bucket data later can tell which was which
-- from the row's age field (still on business_partners).

UPDATE "business_partners" SET "category" = 'business_partner' WHERE "category" = 'life_market';
UPDATE "business_partners" SET "category" = 'fta_contact'      WHERE "category" = 'rollover_market';
