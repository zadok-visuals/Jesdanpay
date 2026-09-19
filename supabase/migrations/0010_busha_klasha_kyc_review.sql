-- Migration 0010: KES wallet provisioning, Busha deposit/swap functions, Klasha automated
-- CNY-settlement functions, and admin KYC review.
--
-- Must run after 0009 (which adds 'KES' to the currency enum) has been executed and committed
-- as a separate script — see 0009's header comment.

-- ── 1. Auto-provision a KES wallet on new signup ─────────────────────────────────
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
  values (new.id, 'USD'), (new.id, 'NGN'), (new.id, 'CNY'), (new.id, 'USDT'),
         (new.id, 'GHS'), (new.id, 'KES');

  return new;
end;
$$;

-- ── 2. Back-fill KES wallet for existing users ───────────────────────────────────
insert into public.wallets (user_id, currency, balance)
select id, 'KES', 0
from public.profiles
where not exists (
  select 1 from public.wallets
  where wallets.user_id = profiles.id
    and wallets.currency = 'KES'
);

-- ── 3. Busha swap: create / complete / fail ──────────────────────────────────────
-- Same shape as the USDT exchange functions in 0006, provider='busha'. Handles
-- NGN/GHS/KES <-> USDT, any pair.
create or replace function create_busha_swap_transaction(
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

grant execute on function create_busha_swap_transaction(currency, currency, numeric, numeric, text) to authenticated;

create or replace function complete_busha_swap_transaction(p_transaction_id uuid)
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
  where id = p_transaction_id and provider = 'busha'
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

create or replace function fail_busha_swap_transaction(p_transaction_id uuid)
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
  where id = p_transaction_id and provider = 'busha'
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

grant execute on function fail_busha_swap_transaction(uuid) to authenticated;

-- set_transaction_provider_reference from 0006 is reused as-is for Busha swaps too.

-- ── 4. Extra recipient fields Klasha's CNY payout requires ──────────────────────
-- Chinese cross-border bank transfers require receiver ID + mobile number that the manual/OTC
-- flow never needed to collect. Nullable — only required when the Klasha path is chosen.
alter table rmb_recipients add column if not exists receiver_id_number text;
alter table rmb_recipients add column if not exists receiver_id_type text;
alter table rmb_recipients add column if not exists receiver_mobile_number text;

-- ── 5. Klasha automated CNY settlement: create / complete / fail ────────────────
-- Funded from a user's existing NGN/GHS balance (never a direct "deposit into Klasha" —
-- see the plan's Provider research for why). Reuses the 'rmb_auto' transaction type that's
-- existed unused since the type was first defined, and the same rmb_recipients table the
-- manual flow already uses for payout details.
create or replace function create_klasha_rmb_transaction(
  p_recipient_id uuid,
  p_source_currency currency,
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

  if p_source_currency not in ('NGN', 'GHS') then
    raise exception 'Klasha settlement is only available from an NGN or GHS balance';
  end if;

  if p_source_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if not exists (
    select 1 from rmb_recipients
    where id = p_recipient_id and user_id = v_user_id
  ) then
    raise exception 'Recipient not found';
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
    v_user_id, 'rmb_auto', 'klasha', 'pending', p_source_amount, p_source_currency,
    'CNY', p_target_amount, p_provider_reference
  )
  returning id into v_transaction_id;

  update rmb_recipients
  set transaction_id = v_transaction_id
  where id = p_recipient_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_klasha_rmb_transaction(uuid, currency, numeric, numeric, text) to authenticated;

create or replace function complete_klasha_rmb_transaction(
  p_transaction_id uuid,
  p_actual_target_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status transaction_status;
begin
  select user_id, status
  into v_user_id, v_status
  from transactions
  where id = p_transaction_id and type = 'rmb_auto' and provider = 'klasha'
  for update;

  if v_user_id is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  update transactions
  set status = 'completed',
      actual_target_amount = p_actual_target_amount
  where id = p_transaction_id;
end;
$$;

create or replace function fail_klasha_rmb_transaction(p_transaction_id uuid)
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
  where id = p_transaction_id and type = 'rmb_auto' and provider = 'klasha'
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

grant execute on function fail_klasha_rmb_transaction(uuid) to authenticated;

-- ── 6. Admin KYC review ───────────────────────────────────────────────────────────
-- kyc_status/kyc_documents.status currently have no writer other than the user's own
-- submission (always sets 'pending') — nothing has ever transitioned these to
-- 'approved'/'rejected'. Same admin-gated security-definer pattern as admin_complete_rmb_transaction.
create or replace function admin_approve_kyc(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set kyc_status = 'approved' where id = p_user_id;

  update kyc_documents
  set status = 'approved'
  where user_id = p_user_id and status = 'pending';
end;
$$;

create or replace function admin_reject_kyc(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set kyc_status = 'rejected' where id = p_user_id;

  update kyc_documents
  set status = 'rejected'
  where user_id = p_user_id and status = 'pending';
end;
$$;

-- admin_approve_kyc / admin_reject_kyc / complete_klasha_rmb_transaction / fail_klasha_rmb_transaction
-- are only ever called via the service-role client from an admin-gated server action, same as
-- every other admin_* function — no self-check needed.
