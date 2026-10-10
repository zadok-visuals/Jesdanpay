-- Migration 0045: record the CNY amount on every new "Send to China" request.
--
-- WHY THIS EXISTS: create_rmb_manual_transaction (migration 0004) only ever inserted user_id,
-- type, provider, status, amount, currency — never target_currency/target_amount. The CNY figure
-- a user sees while filling out the form ("approx ¥32.75 to your vendor") is computed entirely in
-- the browser and was never saved anywhere, so every rmb_manual transaction's target_amount is
-- null and the admin queue (src/app/admin/rmb/page.tsx) has nothing to show for "how much CNY is
-- this" short of recomputing it by hand — exactly the client's complaint. This adds a second
-- version of the function that also takes the server-computed CNY amount and stores it.
--
-- A NEW function rather than changing the existing one: src/lib/actions/payments.ts needs to keep
-- working the moment this file is pasted in, AND for however long it takes this deploy to roll
-- out before that — changing create_rmb_manual_transaction's signature in place would break any
-- in-flight request from a client still running the old code. The v1 function is left completely
-- untouched.
--
-- MUST BE PASTED INTO THE SUPABASE SQL EDITOR BY HAND — this repo has no migration runner wired
-- up to apply files automatically.

create or replace function create_rmb_manual_transaction_v2(
  p_recipient_id uuid,
  p_currency currency,
  p_amount numeric,
  p_target_cny numeric
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

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_target_cny <= 0 then
    raise exception 'Target CNY amount must be greater than zero';
  end if;

  if not exists (
    select 1 from rmb_recipients
    where id = p_recipient_id and user_id = v_user_id
  ) then
    raise exception 'Recipient not found';
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

  update wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = v_user_id and currency = p_currency;

  insert into transactions (user_id, type, provider, status, amount, currency, target_currency, target_amount)
  values (v_user_id, 'rmb_manual', 'klasha', 'pending', p_amount, p_currency, 'CNY', p_target_cny)
  returning id into v_transaction_id;

  update rmb_recipients
  set transaction_id = v_transaction_id
  where id = p_recipient_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_rmb_manual_transaction_v2(uuid, currency, numeric, numeric) to authenticated;
