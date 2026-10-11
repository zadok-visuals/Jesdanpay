-- Migration 0047: allow withdrawing any funded NGN, KES or USDT balance, not just a currency the
-- user has previously deposited.
--
-- MUST BE PASTED INTO THE SUPABASE SQL EDITOR BY HAND — this repo has no migration runner wired
-- up to apply files automatically.
--
-- create_withdrawal_request (migration 0031, the latest definition — confirmed no later
-- migration redefines it) raised "You can only withdraw a currency you have previously deposited"
-- whenever v_has_deposit was false, blocking a legitimate withdrawal of a balance obtained by
-- converting (CNY conversion, USDT/fiat swap) rather than depositing directly. The client wants
-- that rule removed. Every other gate — KYC approval, withdrawal PIN, a saved recipient for this
-- currency, sufficient balance, the 1% fee, the transaction insert, the grant — is unchanged.
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
