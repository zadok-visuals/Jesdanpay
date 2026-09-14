-- Migration 0008: deposits table, GHS wallet provisioning, Quidax swap functions, and
-- RMB margin tracking for the admin queue.
--
-- Must run after 0007 (which adds 'GHS' to currency and 'quidax' to transaction_provider)
-- has been executed and committed as a separate script — see 0007's header comment.

-- ── 1. Auto-provision a GHS wallet on new signup ─────────────────────────────────
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
  values (new.id, 'USD'), (new.id, 'NGN'), (new.id, 'CNY'), (new.id, 'USDT'), (new.id, 'GHS');

  return new;
end;
$$;

-- ── 2. Back-fill GHS wallet for existing users ───────────────────────────────────
insert into public.wallets (user_id, currency, balance)
select id, 'GHS', 0
from public.profiles
where not exists (
  select 1 from public.wallets
  where wallets.user_id = profiles.id
    and wallets.currency = 'GHS'
);

-- ── 3. Deposits ───────────────────────────────────────────────────────────────────
-- A deposit is money entering the system from outside (a user's bank transfer or mobile
-- money payment) — distinct from `transactions`, which is internal balance conversion.
-- Reusing `transactions` for deposits would conflate two different mental models on the
-- Transactions page.
create table if not exists deposits (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles (id) on delete cascade,
  currency            currency not null,
  amount              numeric(18, 2) not null,
  status              transaction_status not null default 'pending',
  provider            transaction_provider not null,
  provider_reference  text,
  created_at          timestamptz not null default now()
);

alter table deposits enable row level security;

create policy "deposits: read own" on deposits for select using (auth.uid() = user_id);

-- No insert policy for regular users — deposits are created via the service-role client
-- from the server action that talks to Quidax, same pattern as `transactions`.

-- ── 4. Credit a completed deposit ────────────────────────────────────────────────
-- security definer; called from the deposit webhook handler once Quidax confirms payment
-- received. Idempotent — no-ops if the deposit isn't pending, so webhook retries are safe.
create or replace function credit_deposit(p_deposit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_currency currency;
  v_amount numeric;
  v_status transaction_status;
begin
  select user_id, currency, amount, status
  into v_user_id, v_currency, v_amount, v_status
  from deposits
  where id = p_deposit_id
  for update;

  if v_user_id is null or v_status <> 'pending' then
    return;
  end if;

  update wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update deposits
  set status = 'completed'
  where id = p_deposit_id;
end;
$$;

-- ── 5. Quidax swap: create / complete / fail ─────────────────────────────────────
-- Same three-function shape as create_usdt_exchange_transaction /
-- complete_/fail_usdt_exchange_transaction in 0006, just provider='quidax' and
-- p_source_currency now also allows 'GHS', not only 'NGN'/'USDT'.
create or replace function create_quidax_swap_transaction(
  p_source_currency currency,
  p_target_currency currency,
  p_source_amount numeric,
  p_target_amount numeric,
  p_provider_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

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

  update wallets
  set balance = balance - p_source_amount, updated_at = now()
  where user_id = v_user_id and currency = p_source_currency;

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount, provider_reference
  )
  values (
    v_user_id, 'usdt_ngn', 'quidax', 'pending', p_source_amount, p_source_currency,
    p_target_currency, p_target_amount, p_provider_reference
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_quidax_swap_transaction(currency, currency, numeric, numeric, text) to authenticated;

create or replace function complete_quidax_swap_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_target_currency currency;
  v_target_amount numeric;
  v_status transaction_status;
begin
  select user_id, target_currency, target_amount, status
  into v_user_id, v_target_currency, v_target_amount, v_status
  from transactions
  where id = p_transaction_id and provider = 'quidax'
  for update;

  if v_user_id is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  update wallets
  set balance = balance + v_target_amount, updated_at = now()
  where user_id = v_user_id and currency = v_target_currency;

  update transactions
  set status = 'completed'
  where id = p_transaction_id;
end;
$$;

create or replace function fail_quidax_swap_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_amount numeric;
  v_currency currency;
  v_status transaction_status;
begin
  select user_id, amount, currency, status
  into v_user_id, v_amount, v_currency, v_status
  from transactions
  where id = p_transaction_id and provider = 'quidax'
  for update;

  if v_user_id is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  update wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update transactions
  set status = 'failed'
  where id = p_transaction_id;
end;
$$;

grant execute on function fail_quidax_swap_transaction(uuid) to authenticated;

-- set_transaction_provider_reference from 0006 is reused as-is for Quidax swaps too —
-- it isn't Busha-specific (just updates a transaction's provider_reference for its owner).

-- ── 6. RMB margin tracking ────────────────────────────────────────────────────────
-- Records what was actually delivered to the vendor in China (via Klasha's OTC desk) so
-- margin becomes computable: requested `amount` vs. `actual_target_amount` received, at
-- whatever rate the admin actually got. Previously nothing tracked this at all.
alter table transactions add column if not exists actual_target_amount numeric(18, 2);
alter table transactions add column if not exists actual_rate_note text;

create or replace function admin_complete_rmb_transaction(
  p_transaction_id uuid,
  p_actual_target_amount numeric,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actual_target_amount <= 0 then
    raise exception 'Actual delivered amount must be greater than zero';
  end if;

  update transactions
  set status = 'completed',
      target_currency = 'CNY',
      actual_target_amount = p_actual_target_amount,
      actual_rate_note = p_note
  where id = p_transaction_id and type = 'rmb_manual';
end;
$$;

-- Only ever called via the service-role client from an admin-gated server action
-- (src/lib/auth/admin.ts), same as the other admin_* functions — no self-check needed.
