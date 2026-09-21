-- Migration 0012: stop provisioning USD and CNY wallets on signup.
--
-- Neither has ever had a real path to a nonzero balance:
--   - USD: no deposit provider, swap, or RMB flow has ever touched it. It's been carried
--     along unused since the very first migration (0001).
--   - CNY: the manual RMB completion function (admin_complete_rmb_transaction, 0008) only
--     records target_currency/actual_target_amount as metadata about what was delivered to
--     the vendor — it has never credited a user's own wallet. There is no deposit or swap path
--     that credits CNY either (Busha and Klasha both reject CNY outright on this account).
--     A user's CNY balance can never become nonzero under any currently-built flow.
--
-- Existing USD/CNY wallet rows (all zero-balance, confirmed before writing this migration) are
-- left in place rather than deleted — this only stops provisioning them for new signups. Ask
-- explicitly if you also want existing zero-balance rows cleaned up.
--
-- 'USD' and 'CNY' stay on the currency enum — Postgres can't drop enum values, and CNY in
-- particular remains a legitimate concept (the settlement currency vendors are paid in), just
-- not something a user holds a wallet balance in.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

  insert into public.wallets (user_id, currency)
  values (new.id, 'NGN'), (new.id, 'USDT'), (new.id, 'GHS'), (new.id, 'KES');

  return new;
end;
$$;
