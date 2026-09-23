-- Migration 0027: automated withdrawal payout via Busha, with a manual-review threshold.
--
-- Withdrawals at or below the USDT 1,000 equivalent are automated via Busha's payout API
-- (Recipient -> Quote with a pay_out object -> Transfer, see src/lib/busha/payout.ts). Anything
-- above that threshold stays on the existing manual admin-approval path, now additionally gated
-- on a confirmed extra-verification step before admin can mark it paid out — the exact
-- verification mechanism (re-uploaded ID, video call, OTP) is still TBD with the client, so this
-- only adds the gate, not the mechanism itself (same "stub it, don't fake it" approach already
-- used for changing a saved payout recipient).

-- ── 1. withdrawal_recipients: fields needed to create a real Busha payout recipient ──────────
alter table withdrawal_recipients
  add column bank_code text,
  add column busha_recipient_id text;

-- set_withdrawal_recipient's parameter list is changing (new p_bank_code) — drop the old
-- 5-arg signature first, same overload-ambiguity reasoning as 0025/0026.
drop function if exists set_withdrawal_recipient(currency, text, text, text, text);

create function set_withdrawal_recipient(
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

  if exists (select 1 from withdrawal_recipients where user_id = v_user_id) then
    raise exception 'A payout recipient is already on file. Changing it requires verification.';
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

grant execute on function set_withdrawal_recipient(currency, text, text, text, text, text) to authenticated;

-- ── 2. transactions: extra-verification gate for above-threshold withdrawals ─────────────────
alter table transactions
  add column requires_extra_verification boolean not null default false,
  add column extra_verification_confirmed_at timestamptz,
  add column extra_verification_confirmed_by uuid references profiles (id);

-- ── 3. System RPCs — called only via the service-role client from server code, mirroring
--       complete_busha_swap_transaction/fail_busha_swap_transaction's exact convention. Never
--       called directly by a user's own session, so no grant to `authenticated`. ───────────────

-- Called right after requestWithdrawal successfully creates a real Busha transfer for an
-- automated (<=1,000 USDT-equivalent) payout — flips the row so it's poll-able by
-- reconcile-busha-transfers (Phase 2) exactly like a swap transaction is.
create function mark_withdrawal_processing(p_transaction_id uuid, p_provider_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set provider = 'busha', status = 'processing', provider_reference = p_provider_reference
  where id = p_transaction_id and type = 'withdrawal' and status = 'pending';
end;
$$;

-- Idempotent, same as complete_busha_swap_transaction — safe to call from requestWithdrawal's
-- own synchronous check AND later from the reconciliation cron for the same row.
create function complete_withdrawal_payout(p_transaction_id uuid)
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

-- Refunds the wallet, mirroring admin_reject_withdrawal exactly — the only difference is this
-- fires automatically after a failed/cancelled Busha payout rather than an admin's own judgment.
create function fail_withdrawal_payout(p_transaction_id uuid)
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

-- Called from requestWithdrawal when the USDT-equivalent amount exceeds the automation
-- threshold — leaves the transaction in today's manual queue, just flagged.
create function flag_withdrawal_for_verification(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set requires_extra_verification = true
  where id = p_transaction_id and type = 'withdrawal';
end;
$$;

-- ── 4. Admin: confirm verification, then gate admin_complete_withdrawal on it ─────────────────
create function admin_confirm_withdrawal_verification(p_transaction_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set extra_verification_confirmed_at = now(), extra_verification_confirmed_by = p_admin_id
  where id = p_transaction_id and type = 'withdrawal' and requires_extra_verification;
end;
$$;

create or replace function admin_complete_withdrawal(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requires_verification boolean;
  v_verified_at timestamptz;
begin
  select requires_extra_verification, extra_verification_confirmed_at
  into v_requires_verification, v_verified_at
  from transactions
  where id = p_transaction_id and type = 'withdrawal';

  if v_requires_verification and v_verified_at is null then
    raise exception 'Additional verification required before this can be marked paid out';
  end if;

  update transactions
  set status = 'completed'
  where id = p_transaction_id and type = 'withdrawal' and status in ('pending', 'processing');
end;
$$;
