-- Migration 0014: country-based wallet provisioning.
--
-- Must run after 0013 (which adds the country_code enum and profiles.country column) has been
-- executed and committed as a separate script — see 0013's header comment.
--
-- Every user previously got NGN + GHS + KES + CNY + USDT regardless of where they actually are,
-- which only ever made sense while there were no country-specific rails. Going forward, a user
-- gets exactly one local-currency wallet (matching their country) plus CNY and USDT, which every
-- user gets regardless of country. CNY is reintroduced here after being dropped in 0012 — it now
-- has a real purpose as the rate-lock synthetic-balance currency (see 0015).

-- ── 1. Provision only the relevant local wallet, by country ─────────────────────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country country_code := coalesce(
    (new.raw_user_meta_data ->> 'country')::country_code,
    'NG'
  );
  v_local_currency currency;
begin
  insert into public.profiles (id, email, full_name, country)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', v_country);

  v_local_currency := case v_country
    when 'NG' then 'NGN'
    when 'GH' then 'GHS'
    when 'KE' then 'KES'
  end;

  insert into public.wallets (user_id, currency)
  values (new.id, v_local_currency), (new.id, 'CNY'), (new.id, 'USDT');

  return new;
end;
$$;

-- ── 2. Backfill existing users: both are Nigerian ────────────────────────────────
update public.profiles set country = 'NG' where country is null;

-- ── 3. Remove GHS/KES wallet rows for Nigerian users ─────────────────────────────
-- Both existing users are confirmed zero-balance on these rows — deleted outright rather than
-- hidden, since no real balance exists to preserve.
delete from public.wallets
where currency in ('GHS', 'KES')
  and user_id in (select id from public.profiles where country = 'NG');

-- ── 4. Re-provision CNY for anyone missing it (e.g. signed up after 0012 dropped it) ──
insert into public.wallets (user_id, currency, balance)
select id, 'CNY', 0
from public.profiles
where not exists (
  select 1 from public.wallets where wallets.user_id = profiles.id and wallets.currency = 'CNY'
);
