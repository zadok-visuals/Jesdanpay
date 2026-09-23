-- Migration 0026: withdrawal transaction PIN + server-side KYC gate.
--
-- Two withdrawal security gaps the client flagged: (1) no PIN separate from the account login
-- password required to authorize a withdrawal, and (2) create_withdrawal_request never checked
-- profiles.kyc_status — a UI-only KYC restriction can be bypassed by calling the RPC directly.
-- Both land in the same migration since both must pass before create_withdrawal_request touches
-- a wallet.

create extension if not exists pgcrypto with schema extensions;

-- ── 1. withdrawal_pins ───────────────────────────────────────────────────────
create table withdrawal_pins (
  user_id uuid primary key references profiles (id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table withdrawal_pins enable row level security;

-- Regular users only ever need to know a PIN exists (to render "set up" vs "already set" in
-- Settings) — the app never selects pin_hash back to the client even though this policy makes
-- the row itself readable, matching the same "read own" shape as withdrawal_recipients.
create policy "withdrawal_pins: read own"
  on withdrawal_pins for select
  using (auth.uid() = user_id);

-- Set once. Changing an existing PIN is deliberately NOT supported by this function — same
-- "verification required, contact support" stance already taken for changing a saved withdrawal
-- recipient (set_withdrawal_recipient above), since a self-service PIN change with no
-- re-verification step is exactly the kind of hole a PIN is meant to close.
create function set_withdrawal_pin(p_pin text)
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

  if exists (select 1 from withdrawal_pins where user_id = v_user_id) then
    raise exception 'A withdrawal PIN is already set. Contact support to change it.';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  insert into withdrawal_pins (user_id, pin_hash)
  values (v_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));
end;
$$;

grant execute on function set_withdrawal_pin(text) to authenticated;

-- ── 2. create_withdrawal_request: KYC gate + PIN check ──────────────────────
-- Adding p_pin changes the parameter list, so create or replace would leave the old 2-arg
-- overload in place too (see 0025's identical note for create_busha_swap_transaction) — drop it
-- explicitly first.
drop function if exists create_withdrawal_request(currency, numeric);

create function create_withdrawal_request(
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
  v_recipient_currency currency;
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

  select currency into v_recipient_currency
  from withdrawal_recipients
  where user_id = v_user_id;

  if v_recipient_currency is null then
    raise exception 'Add a payout recipient before requesting a withdrawal';
  end if;

  if v_recipient_currency <> p_currency then
    raise exception 'Your saved payout recipient is for %, not %', v_recipient_currency, p_currency;
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

grant execute on function create_withdrawal_request(currency, numeric, text) to authenticated;
