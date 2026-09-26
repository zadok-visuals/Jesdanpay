-- Migration 0031: one withdrawal recipient per currency, plus a re-verified change flow.
--
-- withdrawal_recipients previously allowed exactly one row per user, for any currency, ever —
-- set_withdrawal_recipient raised the moment ANY row existed, regardless of currency. A user with
-- an NGN recipient on file was permanently blocked from ever adding a USDT (or any other currency)
-- recipient, and therefore from ever withdrawing that other currency at all. This changes the
-- uniqueness rule to one row per (user, currency), fixes every currency-blind lookup of the table
-- to filter by currency too, and adds a password-re-verified flow for changing an existing
-- currency's recipient (adding a *new* currency's first recipient stays ungated, same as today).

-- ── 1. One row per (user, currency), not per user ─────────────────────────────────────────────
alter table withdrawal_recipients drop constraint withdrawal_recipients_pkey;
alter table withdrawal_recipients add primary key (user_id, currency);

-- ── 2. set_withdrawal_recipient: only block on a row for the SAME currency ────────────────────
create or replace function set_withdrawal_recipient(
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text,
  p_bank_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_kyc_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from withdrawal_recipients where user_id = v_user_id and currency = p_currency) then
    raise exception 'A % payout recipient is already on file. Changing it requires verification.', p_currency;
  end if;

  if not exists (select 1 from wallets where user_id = v_user_id and currency = p_currency) then
    raise exception 'You do not have a % wallet', p_currency;
  end if;

  select full_name into v_kyc_name from profiles where id = v_user_id;

  if v_kyc_name is null or trim(lower(v_kyc_name)) <> trim(lower(p_account_holder_name)) then
    raise exception 'Account holder name must match the name on your KYC profile';
  end if;

  insert into withdrawal_recipients (
    user_id, currency, account_holder_name, bank_account_number, bank_name, wallet_address, bank_code
  )
  values (
    v_user_id, p_currency, p_account_holder_name, p_bank_account_number, p_bank_name, p_wallet_address, p_bank_code
  );
end;
$$;

-- ── 3. create_withdrawal_request: check for a recipient in THIS currency, not "the" recipient ─
-- (this is the current 3-arg version from migration 0026 — KYC + PIN gate — with only the
-- recipient check changed; the rest of the body is unchanged from 0026)
create or replace function create_withdrawal_request(
  p_currency currency,
  p_amount numeric,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_kyc_status kyc_status;
  v_pin_hash text;
  v_has_deposit boolean;
  v_balance numeric;
  v_fee numeric;
  v_net_amount numeric;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select kyc_status into v_kyc_status from profiles where id = v_user_id;
  if v_kyc_status is distinct from 'approved' then
    raise exception 'KYC approval is required before you can request a withdrawal';
  end if;

  select pin_hash into v_pin_hash from withdrawal_pins where user_id = v_user_id;
  if v_pin_hash is null then
    raise exception 'Set a withdrawal PIN in Settings before requesting a withdrawal';
  end if;
  if extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception 'Incorrect withdrawal PIN';
  end if;

  if not exists (select 1 from withdrawal_recipients where user_id = v_user_id and currency = p_currency) then
    raise exception 'Add a payout recipient for % before requesting a withdrawal', p_currency;
  end if;

  select exists(
    select 1 from deposits
    where user_id = v_user_id and currency = p_currency and status = 'completed'
  ) into v_has_deposit;

  if not v_has_deposit then
    raise exception 'You can only withdraw a currency you have previously deposited';
  end if;

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_currency;
  end if;

  if v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  v_fee := round(p_amount * 0.01, 2);
  v_net_amount := p_amount - v_fee;

  update wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = v_user_id and currency = p_currency;

  insert into transactions (
    user_id, type, provider, status, amount, currency, target_currency, target_amount
  )
  values (
    v_user_id, 'withdrawal', 'manual', 'pending', p_amount, p_currency, p_currency, v_net_amount
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

-- ── 4. Change-flow audit + flow-integrity columns — same "flag + confirmed_at + confirmed_by"
--       shape as extra_verification_confirmed_at/_by (migration 0027). ────────────────────────
alter table withdrawal_recipients
  add column pending_change_requested_at timestamptz,
  add column recipient_changed_at timestamptz,
  add column recipient_changed_by uuid references profiles (id);

-- Called when a user starts changing an EXISTING currency's recipient (never for a first-time
-- setup, which still goes through set_withdrawal_recipient above with no gate). The actual
-- password check happens in the TS server action via supabase.auth.signInWithPassword — a
-- Postgres function can't verify an Auth password hash — so this RPC only marks that a change was
-- properly requested; confirm_recipient_change below checks the timestamp is recent before acting.
create function request_recipient_change(p_currency currency)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from withdrawal_recipients where user_id = v_user_id and currency = p_currency) then
    raise exception 'No existing % recipient to change', p_currency;
  end if;

  update withdrawal_recipients
  set pending_change_requested_at = now()
  where user_id = v_user_id and currency = p_currency;
end;
$$;

grant execute on function request_recipient_change(currency) to authenticated;

-- Called after the TS layer has already verified the user's password. Re-checks the KYC-name
-- match exactly like set_withdrawal_recipient, requires request_recipient_change to have run in
-- the last 10 minutes (flow integrity — can't be called cold), and logs who/when on success.
create function confirm_recipient_change(
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text,
  p_bank_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_kyc_name text;
  v_requested_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select pending_change_requested_at into v_requested_at
  from withdrawal_recipients
  where user_id = v_user_id and currency = p_currency
  for update;

  if v_requested_at is null or v_requested_at < now() - interval '10 minutes' then
    raise exception 'Start the change request again';
  end if;

  select full_name into v_kyc_name from profiles where id = v_user_id;

  if v_kyc_name is null or trim(lower(v_kyc_name)) <> trim(lower(p_account_holder_name)) then
    raise exception 'Account holder name must match the name on your KYC profile';
  end if;

  update withdrawal_recipients
  set account_holder_name = p_account_holder_name,
      bank_account_number = p_bank_account_number,
      bank_name = p_bank_name,
      wallet_address = p_wallet_address,
      bank_code = p_bank_code,
      busha_recipient_id = null, -- a changed recipient needs a fresh Busha recipient on next payout
      pending_change_requested_at = null,
      recipient_changed_at = now(),
      recipient_changed_by = v_user_id
  where user_id = v_user_id and currency = p_currency;
end;
$$;

grant execute on function confirm_recipient_change(currency, text, text, text, text, text) to authenticated;
