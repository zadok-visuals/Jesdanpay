-- Migration 0032: supplier rates, for admin PNL reporting.
--
-- Tracks what the admin actually pays their own USDT/CNY/fiat supplier, per currency pair,
-- separate from the rate shown to users (cny_tier_rates, cny_markup_rate). Every rate here — and
-- every customer-side rate computed from a transaction's own recorded amounts for PNL purposes —
-- is expressed as QUOTE-currency per 1 unit of BASE-currency, the same direction already used
-- throughout this codebase (cny_tier_rates.usdt_to_cny_rate = CNY per 1 USDT; Busha's buy/sell
-- rate = fiat per 1 USDT).
--
-- Append-only log, not a mutable row — matches "effective from" language: a new admin-entered
-- rate is a new row, old rows stay for historical lookups ("what rate was in effect when
-- transaction X happened"). Lookup for a pair at time T: the row with the latest effective_from
-- that's still <= T.

create table supplier_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency currency not null,
  quote_currency currency not null,
  buy_rate numeric(18, 6) not null,
  effective_from timestamptz not null default now(),
  set_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

alter table supplier_rates enable row level security;
create policy "supplier_rates: read all" on supplier_rates for select using (true);
-- No insert/update/delete policy for regular users — admin-only, via the service-role client
-- from an admin-gated server action, same convention as cny_tier_rates/cny_markup_rate.

create index supplier_rates_pair_effective_idx on supplier_rates (base_currency, quote_currency, effective_from desc);

-- Same "service-role client from an admin-gated server action calls a security-definer RPC"
-- convention as admin_set_cny_tier_rate / admin_set_cny_markup_rate.
create function admin_set_supplier_rate(
  p_base_currency currency,
  p_quote_currency currency,
  p_buy_rate numeric,
  p_effective_from timestamptz,
  p_set_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into supplier_rates (base_currency, quote_currency, buy_rate, effective_from, set_by)
  values (p_base_currency, p_quote_currency, p_buy_rate, p_effective_from, p_set_by);
end;
$$;
