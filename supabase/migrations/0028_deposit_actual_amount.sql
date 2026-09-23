-- Migration 0028: credit deposits for the actual on-chain/confirmed amount, not the originally
-- requested one.
--
-- Root cause of a real live case (found while investigating the reconciliation-cron outage): a
-- user requested a 10 USDT deposit, but sent 12 USDT on-chain. Busha's own transfer object
-- self-corrects source_amount/target_amount to the real confirmed amount once funds arrive — but
-- credit_deposit only ever read `deposits.amount`, which was fixed at 10 back when the deposit
-- was first initiated, before anything was actually sent. Crediting that deposit today would have
-- short-changed the user by 2 USDT.
--
-- Fix: credit_deposit now takes an optional actual amount to credit; every Busha-related caller
-- (webhook, checkDepositStatus poll, reconcile-deposits cron) fetches a fresh transfer lookup and
-- passes the real confirmed amount through. `confirmed_amount` records what was actually
-- credited, separate from `amount` (what was originally requested), so the two can be shown side
-- by side in the transaction detail view when they differ.

alter table deposits
  add column confirmed_amount numeric(18, 2);

-- Adding a parameter changes the signature — create or replace can't do that (same reasoning as
-- every prior migration that extended an RPC's argument list). Drop the old 1-arg version first.
drop function if exists credit_deposit(uuid);

create function credit_deposit(p_deposit_id uuid, p_actual_amount numeric default null)
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
  v_credit_amount numeric;
begin
  select user_id, currency, amount, status
  into v_user_id, v_currency, v_amount, v_status
  from deposits
  where id = p_deposit_id
  for update;

  if v_user_id is null or v_status <> 'pending' then
    return;
  end if;

  -- Falls back to the originally requested amount when no actual amount is supplied (e.g. the
  -- Klasha webhook, which has no equivalent "re-check the real confirmed amount" step today).
  v_credit_amount := coalesce(p_actual_amount, v_amount);

  update wallets
  set balance = balance + v_credit_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update deposits
  set status = 'completed', confirmed_amount = v_credit_amount
  where id = p_deposit_id;
end;
$$;
