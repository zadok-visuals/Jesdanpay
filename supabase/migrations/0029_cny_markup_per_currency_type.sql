-- Migration 0029: split the single CNY markup back into fiat vs USDT, admin-editable.
--
-- Migration 0023 deliberately retired a hardcoded 2%-fiat/1%-USDT split in favor of one global
-- admin-configurable value — but that collapsed USDT into the same 2% as NGN/GHS/KES, which the
-- client has now confirmed is wrong (it should still be 1% for USDT). Rather than reverting to a
-- hardcoded split (losing the admin-configurability 0023 was built for), this keeps one singleton
-- row but with two independently editable columns — Convert CNY and Pay to China both read
-- whichever one applies, so there's still exactly one source of truth per currency type, just two
-- values instead of one.

alter table cny_markup_rate
  rename column markup_rate to fiat_markup_rate;

alter table cny_markup_rate
  add column usdt_markup_rate numeric(5, 4) not null default 0.01;

update cny_markup_rate set usdt_markup_rate = 0.01 where id = true;

-- Signature changes from (numeric) to (numeric, numeric) — create or replace can't do that
-- (same reasoning as every prior RPC signature change this session), drop the old one first.
drop function if exists admin_set_cny_markup_rate(numeric);

create function admin_set_cny_markup_rate(p_fiat_markup_rate numeric, p_usdt_markup_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fiat_markup_rate < 0 or p_fiat_markup_rate >= 1 then
    raise exception 'Fiat markup must be between 0 and 1 (e.g. 0.02 for 2%%)';
  end if;
  if p_usdt_markup_rate < 0 or p_usdt_markup_rate >= 1 then
    raise exception 'USDT markup must be between 0 and 1 (e.g. 0.01 for 1%%)';
  end if;

  update cny_markup_rate
  set fiat_markup_rate = p_fiat_markup_rate, usdt_markup_rate = p_usdt_markup_rate, updated_at = now()
  where id = true;
end;
$$;
