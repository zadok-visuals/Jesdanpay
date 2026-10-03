-- Migration 0036: RMB (Send to China) rejection reason.
--
-- Mirrors migration 0033 (KYC rejection reason) exactly: admin_reject_rmb_transaction took only a
-- transaction id, no reason — a user whose "Send to China" request was rejected had no way to
-- see why, the same gap 0033 closed for KYC. Adds a rejection_reason column to transactions and a
-- p_reason param on the RPC, same shape as profiles.kyc_rejection_reason / admin_reject_kyc, and
-- same create-or-replace-without-a-drop approach 0033 itself used for the signature change.

alter table transactions add column rejection_reason text;

create or replace function admin_reject_rmb_transaction(p_transaction_id uuid, p_reason text)
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
  set status = 'failed', rejection_reason = p_reason
  where id = p_transaction_id;
end;
$$;

-- admin_reject_rmb_transaction is only ever called via the service-role client from an
-- admin-gated server action, same as every other admin_* function — no grant to authenticated,
-- no self-check needed.
