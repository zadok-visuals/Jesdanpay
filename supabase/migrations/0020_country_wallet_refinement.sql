-- Migration 0020: country-based wallet provisioning refinement.
--
-- The country_code enum only ever supported NG/GH/KE, but a user's real country should be
-- captured as-is regardless of whether JesDanPay supports a local wallet for it yet — an enum
-- restricted to 3 values can't hold e.g. 'US' or 'GB' accurately. profiles.country becomes a
-- plain text column (still the ISO 3166-1 alpha-2 code the signup form sends) and the
-- country_code enum is dropped since nothing references it anymore.
--
-- Wallet provisioning logic: NG -> NGN, GH -> GHS, KE -> KES, anything else -> no local wallet
-- at all (just CNY + USDT, same as before). Previously an unrecognized/missing country
-- defaulted to NGN — that fallback existed only to bootstrap the two pre-existing Nigerian users
-- in 0014's backfill; new signups now always submit a real country, so a missing value falls
-- into the same "no local wallet" bucket as any other unsupported country rather than assuming
-- Nigeria.

alter table profiles alter column country type text using country::text;

drop type country_code;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := new.raw_user_meta_data ->> 'country';
  v_local_currency currency := case v_country
    when 'NG' then 'NGN'
    when 'GH' then 'GHS'
    when 'KE' then 'KES'
    else null
  end;
begin
  insert into public.profiles (id, email, full_name, country)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', v_country);

  if v_local_currency is not null then
    insert into public.wallets (user_id, currency) values (new.id, v_local_currency);
  end if;

  insert into public.wallets (user_id, currency)
  values (new.id, 'CNY'), (new.id, 'USDT');

  return new;
end;
$$;

-- Also block setting a withdrawal recipient for a currency the user has no wallet for — e.g. a
-- non-NG/GH/KE user (only USDT + CNY) trying to save an NGN payout recipient, which could never
-- actually be used since create_withdrawal_request already requires a deposit history in that
-- currency.
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

  if not exists (select 1 from wallets where user_id = v_user_id and currency = p_currency) then
    raise exception 'You do not have a % wallet', p_currency;
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
