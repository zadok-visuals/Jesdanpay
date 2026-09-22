-- Migration 0019: withdrawals.
--
-- Must run after 0017 and 0018 (which add 'withdrawal'/'manual' to their enums) have been
-- executed and committed as separate scripts — see their header comments.
--
-- Users can only withdraw a currency they've previously deposited (no convert-then-withdraw),
-- and only one payout recipient is stored per user at all — set once, tied to a single
-- currency, with the account holder name checked against the KYC name on file to block
-- third-party payouts. Replacing an existing recipient needs a real verification step that
-- isn't confirmed yet (pending a decision), so update_withdrawal_recipient deliberately doesn't
-- exist here — only first-time setup does. The UI stubs the "change recipient" path with a
-- placeholder until that's decided.

-- ── 1. Payout recipient — one per user, first-time setup only ────────────────────
create table withdrawal_recipients (
  user_id uuid primary key references profiles (id) on delete cascade,
  currency currency not null,
  account_holder_name text not null,
  bank_account_number text,
  bank_name text,
  wallet_address text,
  created_at timestamptz not null default now(),
  constraint withdrawal_recipients_has_payout_details check (
    (bank_account_number is not null and bank_name is not null) or wallet_address is not null
  )
);

alter table withdrawal_recipients enable row level security;

create policy "withdrawal_recipients: read own" on withdrawal_recipients for select using (auth.uid() = user_id);
-- No insert/update policy for regular users — set only via set_withdrawal_recipient below, which
-- checks the account holder name against the KYC name on file before writing.

create or replace function set_withdrawal_recipient(
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text
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

  if exists (select 1 from withdrawal_recipients where user_id = v_user_id) then
    raise exception 'A payout recipient is already on file. Changing it requires verification.';
  end if;

  select full_name into v_kyc_name from profiles where id = v_user_id;

  if v_kyc_name is null or trim(lower(v_kyc_name)) <> trim(lower(p_account_holder_name)) then
    raise exception 'Account holder name must match the name on your KYC profile';
  end if;

  insert into withdrawal_recipients (
    user_id, currency, account_holder_name, bank_account_number, bank_name, wallet_address
  )
  values (v_user_id, p_currency, p_account_holder_name, p_bank_account_number, p_bank_name, p_wallet_address);
end;
$$;

grant execute on function set_withdrawal_recipient(currency, text, text, text, text) to authenticated;

-- ── 2. Create a withdrawal request ────────────────────────────────────────────────
-- Same debit-then-record shape as create_rmb_manual_transaction. A flat 1% fee is deducted from
-- the requested amount — the wallet is debited for the full amount, and target_amount (reusing
-- the existing transactions column) records what the recipient actually receives net of fee.
create or replace function create_withdrawal_request(
  p_currency currency,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

grant execute on function create_withdrawal_request(currency, numeric) to authenticated;

-- ── 3. Admin: complete / reject a withdrawal ──────────────────────────────────────
-- Only ever called via the service-role client from an admin-gated server action, same as
-- every other admin_* function — no self-check needed.
create or replace function admin_complete_withdrawal(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set status = 'completed'
  where id = p_transaction_id and type = 'withdrawal' and status in ('pending', 'processing');
end;
$$;

create or replace function admin_reject_withdrawal(p_transaction_id uuid)
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
  where id = p_transaction_id and type = 'withdrawal'
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
