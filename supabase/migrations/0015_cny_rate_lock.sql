-- Migration 0015: CNY synthetic rate-lock ledger.
--
-- Not real custody — no provider (Busha or Klasha) holds or converts CNY at all. This is
-- internal bookkeeping on top of an admin-maintained reference rate: a user locks in a
-- CNY-denominated balance from NGN/GHS/KES/USDT at today's published rate minus a margin, and
-- can later spend that locked balance through the existing manual "Send to China" RMB flow
-- (create_rmb_manual_transaction already debits whatever currency wallet it's given, so no
-- changes are needed there). The margin protects the business from adverse rate movement
-- between lock time and whenever the admin actually settles with the vendor.

-- ── 1. Admin-maintained reference rates ──────────────────────────────────────────
-- One row per source currency. Admin updates these manually — there's no live market-data feed
-- wired up, consistent with RMB settlement already being a manual, admin-mediated process. A
-- null rate means conversion from that currency isn't available yet (admin hasn't set one).
create table admin_fx_rates (
  source_currency currency primary key,
  cny_rate numeric(18, 6),
  updated_at timestamptz not null default now()
);

insert into admin_fx_rates (source_currency, cny_rate)
values ('NGN', null), ('GHS', null), ('KES', null), ('USDT', null);

alter table admin_fx_rates enable row level security;

create policy "admin_fx_rates: read all" on admin_fx_rates for select using (true);
-- No insert/update policy for regular users — only the service-role client (from an
-- admin-gated server action) writes here, same pattern as every other admin_* table.

-- ── 2. Conversion audit trail ────────────────────────────────────────────────────
-- Drives Milestone 3's admin visibility item (source currency, locked-in rate, timestamp per
-- user) directly.
create table cny_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  source_currency currency not null,
  source_amount numeric(18, 2) not null,
  published_rate numeric(18, 6) not null,
  margin_rate numeric(5, 4) not null,
  locked_rate numeric(18, 6) not null,
  locked_cny_amount numeric(18, 2) not null,
  created_at timestamptz not null default now()
);

alter table cny_conversions enable row level security;

create policy "cny_conversions: read own" on cny_conversions for select using (auth.uid() = user_id);

-- ── 3. Lock a CNY balance from a source-currency wallet ──────────────────────────
-- Same debit-then-credit shape as create_busha_swap_transaction (0010): locks the source
-- wallet row, reads the current admin-set rate, computes the margin-adjusted locked rate,
-- debits source, credits CNY, records the audit row. Margin: 2% for NGN/GHS/KES, 1% for USDT
-- (confirmed rates).
create or replace function convert_to_cny_locked(
  p_source_currency currency,
  p_source_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_published_rate numeric;
  v_margin_rate numeric;
  v_locked_rate numeric;
  v_locked_cny_amount numeric;
  v_conversion_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_source_currency not in ('NGN', 'GHS', 'KES', 'USDT') then
    raise exception 'Unsupported source currency %', p_source_currency;
  end if;

  v_margin_rate := case p_source_currency when 'USDT' then 0.01 else 0.02 end;

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_source_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_source_currency;
  end if;

  if v_balance < p_source_amount then
    raise exception 'Insufficient balance';
  end if;

  select cny_rate into v_published_rate
  from admin_fx_rates
  where source_currency = p_source_currency
  for update;

  if v_published_rate is null then
    raise exception 'CNY conversion is not available for % right now', p_source_currency;
  end if;

  v_locked_rate := v_published_rate * (1 - v_margin_rate);
  v_locked_cny_amount := round(p_source_amount * v_locked_rate, 2);

  update wallets
  set balance = balance - p_source_amount, updated_at = now()
  where user_id = v_user_id and currency = p_source_currency;

  update wallets
  set balance = balance + v_locked_cny_amount, updated_at = now()
  where user_id = v_user_id and currency = 'CNY';

  insert into cny_conversions (
    user_id, source_currency, source_amount, published_rate, margin_rate,
    locked_rate, locked_cny_amount
  )
  values (
    v_user_id, p_source_currency, p_source_amount, v_published_rate, v_margin_rate,
    v_locked_rate, v_locked_cny_amount
  )
  returning id into v_conversion_id;

  return v_conversion_id;
end;
$$;

grant execute on function convert_to_cny_locked(currency, numeric) to authenticated;

-- ── 4. Admin: set the published rate for a currency ──────────────────────────────
create or replace function admin_set_fx_rate(p_source_currency currency, p_cny_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cny_rate <= 0 then
    raise exception 'Rate must be greater than zero';
  end if;

  update admin_fx_rates
  set cny_rate = p_cny_rate, updated_at = now()
  where source_currency = p_source_currency;
end;
$$;

-- admin_set_fx_rate is only ever called via the service-role client from an admin-gated server
-- action, same as every other admin_* function — no self-check needed.
