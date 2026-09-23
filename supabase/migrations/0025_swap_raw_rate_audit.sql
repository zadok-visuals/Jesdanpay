-- Migration 0025: raw (pre-markup) target amount audit trail for Busha swaps.
--
-- executeSwap (src/lib/actions/busha.ts) reads Busha's real, unmarked-up transfer.target_amount
-- on every swap, applies the 0.5% markup (src/lib/busha/markup.ts), and only ever persists the
-- post-markup amount — the raw figure is read and then discarded. Unlike cny_conversions (which
-- already stores busha_rate/tier_rate/margin_rate per row), there has been no way to reconstruct
-- how much markup a swap actually collected. This adds a column to capture it going forward and
-- threads it through create_busha_swap_transaction.
--
-- Existing rows get a null raw_target_amount — there's no way to recover Busha's original
-- response for a swap that already completed, so historical markup for those rows stays
-- unrecoverable and is excluded from any total computed off this column (the admin UI says so).

alter table transactions
  add column raw_target_amount numeric(18, 2);

-- create or replace can't change a function's parameter list — it would leave the old 5-arg
-- overload in place alongside this new 6-arg one, and PostgREST's rpc() call (which passes named
-- args) would then be ambiguous between them. Drop the old signature explicitly first.
drop function if exists create_busha_swap_transaction(currency, currency, numeric, numeric, text);

create function create_busha_swap_transaction(
  p_source_currency currency,
  p_target_currency currency,
  p_source_amount numeric,
  p_target_amount numeric,
  p_provider_reference text,
  p_raw_target_amount numeric default null
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

  if p_source_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_source_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_source_currency;
  end if;

  if v_balance < p_source_amount then
    raise exception 'Insufficient balance';
  end if;

  update wallets
  set balance = balance - p_source_amount, updated_at = now()
  where user_id = v_user_id and currency = p_source_currency;

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount, provider_reference, raw_target_amount
  )
  values (
    v_user_id, 'usdt_ngn', 'busha', 'pending', p_source_amount, p_source_currency,
    p_target_currency, p_target_amount, p_provider_reference, p_raw_target_amount
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_busha_swap_transaction(currency, currency, numeric, numeric, text, numeric) to authenticated;
