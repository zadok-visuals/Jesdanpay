-- Migration 0035: store network on withdrawal recipients, add a self-service PIN change.
--
-- Two independent gaps bundled together since both are small, additive changes to the
-- withdrawal-settings surface:
--
-- 1. withdrawal_recipients had no column recording which network a USDT wallet address is on —
--    src/lib/busha/payout.ts's createPayoutTransfer hardcoded `network: "BSC"` three files away
--    from where the recipient is actually saved (BSC is the only network this Busha account
--    accepts at all, per busha/client.ts's header comment, so there's nothing to guess at for the
--    backfill — every existing wallet_address row is already a BSC address in practice).
-- 2. withdrawal_pins had set_withdrawal_pin (first-time only — raises if a PIN already exists,
--    see migration 0026's header comment) but no change path at all, leaving TransactionPinCard's
--    "contact support" stub as the only option, exactly like withdrawal_recipients before
--    migration 0031 added its own re-verified change flow.

-- ── 1. network column + backfill ──────────────────────────────────────────────────────────────
alter table withdrawal_recipients add column network text;
update withdrawal_recipients set network = 'BSC' where wallet_address is not null;

-- ── 2. set_withdrawal_recipient / confirm_recipient_change: add p_network ───────────────────────
-- New param changes the signature — drop the old 6-arg versions first, same convention as every
-- prior signature change to these two functions (see migrations 0025/0026/0027/0031).
drop function if exists set_withdrawal_recipient(currency, text, text, text, text, text);
drop function if exists confirm_recipient_change(currency, text, text, text, text, text);

create function set_withdrawal_recipient(
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text,
  p_bank_code text,
  p_network text
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
    user_id, currency, account_holder_name, bank_account_number, bank_name, wallet_address, bank_code, network
  )
  values (
    v_user_id, p_currency, p_account_holder_name, p_bank_account_number, p_bank_name, p_wallet_address, p_bank_code, p_network
  );
end;
$$;

grant execute on function set_withdrawal_recipient(currency, text, text, text, text, text, text) to authenticated;

create function confirm_recipient_change(
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text,
  p_bank_code text,
  p_network text
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
      network = p_network,
      busha_recipient_id = null, -- a changed recipient needs a fresh Busha recipient on next payout
      pending_change_requested_at = null,
      recipient_changed_at = now(),
      recipient_changed_by = v_user_id
  where user_id = v_user_id and currency = p_currency;
end;
$$;

grant execute on function confirm_recipient_change(currency, text, text, text, text, text, text) to authenticated;

-- ── 3. change_withdrawal_pin — same re-verified-in-TS trust model as confirm_recipient_change ──
-- The TS action (changeWithdrawalPin, src/lib/actions/withdrawals.ts) re-verifies the user's
-- password via supabase.auth.signInWithPassword immediately before calling this — a Postgres
-- function can't check an Auth password hash — so this RPC itself needs no old-PIN check, just
-- confirmation a row already exists (this is a change path, not first-time setup).
create function change_withdrawal_pin(p_pin text)
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

  if not exists (select 1 from withdrawal_pins where user_id = v_user_id) then
    raise exception 'No withdrawal PIN is set yet';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  update withdrawal_pins
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      updated_at = now()
  where user_id = v_user_id;
end;
$$;

grant execute on function change_withdrawal_pin(text) to authenticated;
