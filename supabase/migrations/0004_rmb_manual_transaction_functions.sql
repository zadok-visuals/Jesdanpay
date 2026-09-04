-- Migration 0004: atomic transaction creation for the manual/OTC RMB flow.
--
-- Klasha has no API for RMB transfers (OTC only), so the RMB exchange flow is
-- manual-only: submitting a request must atomically debit the wallet and create
-- a pending transaction (a plain JS-side "update then insert" risks partial
-- failure or a race on double-submit), and rejecting a request must atomically
-- refund the wallet. Both are security definer functions so a single sanctioned
-- write path exists for these financial mutations — regular users have no
-- insert/update grant on `transactions` or `wallets` directly.

create or replace function create_rmb_manual_transaction(
  p_recipient_id uuid,
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
  v_balance numeric;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount <= 0 then
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

  insert into transactions (user_id, type, provider, status, amount, currency)
  values (v_user_id, 'rmb_manual', 'klasha', 'pending', p_amount, p_currency)
  returning id into v_transaction_id;

  update rmb_recipients
  set transaction_id = v_transaction_id
  where id = p_recipient_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_rmb_manual_transaction(uuid, currency, numeric) to authenticated;

-- Only ever called via the service-role client from an admin-gated server
-- action (see src/lib/auth/admin.ts), so it doesn't re-check who's calling.
create or replace function admin_reject_rmb_transaction(p_transaction_id uuid)
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
  where id = p_transaction_id and type = 'rmb_manual'
  for update;

  if v_user_id is null then
    raise exception 'Transaction not found';
  end if;

  if v_status = 'failed' then
    raise exception 'Transaction already rejected';
  end if;

  update wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update transactions
  set status = 'failed'
  where id = p_transaction_id;
end;
$$;
