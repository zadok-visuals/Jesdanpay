-- Migration 0006: USDT wallet provisioning + atomic USDT<->NGN exchange functions.
--
-- Must run after 0005 (which adds 'USDT' to the currency enum) has been executed and
-- committed as a separate script — see 0005's header comment.

-- ── 1. Record what the user receives, not just what they send ───────────────────
-- `amount`/`currency` already cover the debited side; the exchange also needs to know
-- what to credit on completion and to show on the Transactions page.
alter table transactions add column if not exists target_currency currency;
alter table transactions add column if not exists target_amount numeric(18, 2);

-- ── 2. Auto-provision a USDT wallet on new signup ────────────────────────────────
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
  values (new.id, 'USD'), (new.id, 'NGN'), (new.id, 'CNY'), (new.id, 'USDT');

  return new;
end;
$$;

-- ── 3. Back-fill USDT wallet for existing users ──────────────────────────────────
insert into public.wallets (user_id, currency, balance)
select id, 'USDT', 0
from public.profiles
where not exists (
  select 1 from public.wallets
  where wallets.user_id = profiles.id
    and wallets.currency = 'USDT'
);

-- ── 4. Create a pending exchange: debit source wallet, insert transaction ───────
-- Derives the user from auth.uid() (never trusts a client-supplied user id). Locks
-- the source wallet row to avoid a race on double-submit.
create or replace function create_usdt_exchange_transaction(
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
    v_user_id, 'usdt_ngn', 'busha', 'pending', p_source_amount, p_source_currency,
    p_target_currency, p_target_amount, p_provider_reference
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_usdt_exchange_transaction(currency, currency, numeric, numeric, text) to authenticated;

-- ── 5. Let the owning user attach the real Busha transfer id after creation ─────
-- The transaction is created with a placeholder reference (the quote id) before we
-- know the transfer id Busha will assign; this updates it once we do.
create or replace function set_transaction_provider_reference(
  p_transaction_id uuid,
  p_provider_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set provider_reference = p_provider_reference
  where id = p_transaction_id and user_id = auth.uid();
end;
$$;

grant execute on function set_transaction_provider_reference(uuid, text) to authenticated;

-- ── 6. Complete / fail an exchange ────────────────────────────────────────────────
-- Called from the user-facing flow (if Busha's transfer call fails right after we've
-- already debited) and from the webhook handler (if Busha reports completion/failure
-- later). Both no-op instead of raising when the transaction isn't pending/processing,
-- so webhook retries are safe to replay.
create or replace function complete_usdt_exchange_transaction(p_transaction_id uuid)
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
  where id = p_transaction_id and type = 'usdt_ngn'
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

create or replace function fail_usdt_exchange_transaction(p_transaction_id uuid)
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
  where id = p_transaction_id and type = 'usdt_ngn'
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

grant execute on function fail_usdt_exchange_transaction(uuid) to authenticated;
