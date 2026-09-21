-- Migration 0011: drop the dead Klasha "automated CNY settlement" functions and recipient
-- columns left behind by the original version of 0010.
--
-- Klasha's own engineering and product teams confirmed their CNY payout API is merchant-only
-- (for a business to pay its own vendors from the Klasha dashboard) — not something that can
-- be resold to end customers via API. It was never actually usable for this app's RMB flow,
-- and the account access issues we spent time debugging were a symptom of that mismatch, not
-- a configuration problem. CNY settlement goes through the manual OTC queue for every source
-- currency now, same as before this was ever attempted.
--
-- Safe to drop: this path was blocked (403/maintenance) for its entire existence, so no real
-- transactions or recipients ever used it — confirmed via a direct query before writing this
-- migration.

drop function if exists create_klasha_rmb_transaction(uuid, currency, numeric, numeric, text);
drop function if exists complete_klasha_rmb_transaction(uuid, numeric);
drop function if exists fail_klasha_rmb_transaction(uuid);

alter table rmb_recipients drop column if exists receiver_id_number;
alter table rmb_recipients drop column if exists receiver_id_type;
alter table rmb_recipients drop column if exists receiver_mobile_number;

-- Not touched, deliberately: the 'rmb_auto' value on the transaction_type enum (defined since
-- 0001, Postgres can't drop enum values without rebuilding the type) and the 'klasha' value on
-- transaction_provider (still actively used for Klasha's NGN/GHS deposit collection).
