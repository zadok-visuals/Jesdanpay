-- Migration 0018: add 'manual' to the transaction_provider enum.
--
-- Its own migration/script — same enum-isolation rule as 0002/0017. Withdrawals are settled
-- manually by admin (there's no payout API integrated), so they shouldn't be mischaracterized
-- as going through Klasha or Busha the way rmb_manual currently is (a pre-existing quirk, left
-- alone since it's out of scope here).

alter type transaction_provider add value if not exists 'manual';
