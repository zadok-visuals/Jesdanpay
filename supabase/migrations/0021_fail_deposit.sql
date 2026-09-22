-- Migration 0021: fail_deposit — the missing counterpart to credit_deposit.
--
-- Found during the second "deposit not reflecting" investigation: a Busha pay-in that expires or
-- gets cancelled on Busha's side had no path to ever leave 'pending' in our own `deposits` table
-- — credit_deposit only handles the success case. That left abandoned deposits sitting pending
-- forever, indistinguishable from ones still genuinely in flight, which is the same "silent
-- failure" category as the webhook bug itself. Same idempotent, no-op-if-not-pending shape as
-- credit_deposit so both the webhook and the reconciliation poll can call it safely on retry.

create or replace function fail_deposit(p_deposit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status transaction_status;
begin
  select status into v_status
  from deposits
  where id = p_deposit_id
  for update;

  if v_status is null or v_status <> 'pending' then
    return;
  end if;

  update deposits
  set status = 'failed'
  where id = p_deposit_id;
end;
$$;
