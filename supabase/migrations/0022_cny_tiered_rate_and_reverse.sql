-- Migration 0022: live-rate tiered CNY pricing + CNY <-> fiat/USDT reverse conversion.
--
-- Replaces the flat, admin-typed admin_fx_rates mechanism (0015) — confirmed unused in
-- production (every row's cny_rate is still null, cny_conversions has zero rows) — with a
-- pricing model that blends a live Busha fiat/USDT rate with a tiered internal USDT/CNY rate.
-- That blend needs a live external API call, which Postgres can't make, so the rate lookup now
-- happens in the server action layer (src/lib/actions/payments.ts); this migration only holds
-- the tiered-rate table admins edit and a direction-agnostic RPC that takes already-computed
-- amounts and performs the atomic wallet debit/credit + audit insert, in either direction.

-- ── 1. Retire the flat per-currency rate mechanism ───────────────────────────────
drop function if exists admin_set_fx_rate(currency, numeric);
drop function if exists convert_to_cny_locked(currency, numeric);
drop table if exists admin_fx_rates;
drop table if exists cny_conversions;

-- ── 2. Tiered USDT <-> CNY rate, admin-editable ──────────────────────────────────
-- Rate tiers by CNY volume, shared across every source/target currency (the live Busha rate
-- handles the fiat leg; this handles the USDT/CNY leg on top of it).
create table cny_tier_rates (
  tier_min_cny numeric(18, 2) primary key,
  tier_max_cny numeric(18, 2) not null,
  usdt_to_cny_rate numeric(18, 6) not null,
  updated_at timestamptz not null default now()
);

insert into cny_tier_rates (tier_min_cny, tier_max_cny, usdt_to_cny_rate)
values (0, 999, 6.5), (1000, 100000, 6.6);

alter table cny_tier_rates enable row level security;

create policy "cny_tier_rates: read all" on cny_tier_rates for select using (true);
-- No insert/update policy for regular users — only the service-role client (from an admin-gated
-- server action) writes here, same pattern as every other admin_* table.

-- ── 3. Direction-agnostic conversion audit trail ─────────────────────────────────
-- Replaces the old one-directional cny_conversions shape. Drives Milestone 3's admin CNY
-- visibility item in either direction.
create table cny_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  direction text not null check (direction in ('to_cny', 'from_cny')),
  from_currency currency not null,
  from_amount numeric(18, 2) not null,
  to_currency currency not null,
  to_amount numeric(18, 2) not null,
  busha_rate numeric(18, 6),
  tier_rate numeric(18, 6) not null,
  margin_rate numeric(5, 4) not null,
  created_at timestamptz not null default now()
);

alter table cny_conversions enable row level security;

create policy "cny_conversions: read own" on cny_conversions for select using (auth.uid() = user_id);

-- ── 4. Record a conversion (either direction) ────────────────────────────────────
-- Same locked-row debit/credit shape as every other financial RPC in this project
-- (create_busha_swap_transaction, credit_deposit, etc.) — the caller has already computed
-- from/to amounts (live rate + tiered rate + margin all resolved server-side beforehand); this
-- just performs the atomic wallet mutation and audit insert.
create or replace function record_cny_conversion(
  p_direction text,
  p_from_currency currency,
  p_from_amount numeric,
  p_to_currency currency,
  p_to_amount numeric,
  p_busha_rate numeric,
  p_tier_rate numeric,
  p_margin_rate numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_conversion_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_direction not in ('to_cny', 'from_cny') then
    raise exception 'Invalid direction %', p_direction;
  end if;

  if p_from_amount <= 0 or p_to_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_from_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_from_currency;
  end if;

  if v_balance < p_from_amount then
    raise exception 'Insufficient balance';
  end if;

  update wallets
  set balance = balance - p_from_amount, updated_at = now()
  where user_id = v_user_id and currency = p_from_currency;

  update wallets
  set balance = balance + p_to_amount, updated_at = now()
  where user_id = v_user_id and currency = p_to_currency;

  insert into cny_conversions (
    user_id, direction, from_currency, from_amount, to_currency, to_amount,
    busha_rate, tier_rate, margin_rate
  )
  values (
    v_user_id, p_direction, p_from_currency, p_from_amount, p_to_currency, p_to_amount,
    p_busha_rate, p_tier_rate, p_margin_rate
  )
  returning id into v_conversion_id;

  return v_conversion_id;
end;
$$;

grant execute on function record_cny_conversion(text, currency, numeric, currency, numeric, numeric, numeric, numeric) to authenticated;

-- ── 5. Admin: update one tier's rate ──────────────────────────────────────────────
create or replace function admin_set_cny_tier_rate(p_tier_min numeric, p_cny_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cny_rate <= 0 then
    raise exception 'Rate must be greater than zero';
  end if;

  update cny_tier_rates
  set usdt_to_cny_rate = p_cny_rate, updated_at = now()
  where tier_min_cny = p_tier_min;
end;
$$;

-- admin_set_cny_tier_rate is only ever called via the service-role client from an admin-gated
-- server action, same as every other admin_* function — no self-check needed.
