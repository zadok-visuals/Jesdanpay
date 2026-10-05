-- Migration 0042: strip provider names out of customer-readable stored text.
--
-- transactions.automated_payout_attempt_failed_reason is written by
-- record_automated_payout_failure (migration 0030), called from
-- src/lib/withdrawals/automated-payout.ts. The "transactions: read own" RLS policy
-- (migration 0001) lets a user's own session select their full transactions row directly
-- (not just through the app's own UI, which doesn't currently render this column at all) — so
-- the previous wording ("Below Busha's minimum payout amount (...)") was technically readable
-- by the customer even though no screen shows it today. Rewrite any existing rows to match the
-- neutral wording the app now writes for new ones ("Below the minimum payout amount (...)").
update transactions
set automated_payout_attempt_failed_reason =
  replace(automated_payout_attempt_failed_reason, 'Below Busha''s minimum payout amount', 'Below the minimum payout amount')
where automated_payout_attempt_failed_reason like '%Busha%';
