-- Migration 0023: single admin-configurable CNY markup.
--
-- Retires the per-currency-type margin (2% fiat / 1% USDT, hardcoded in marginFor()) in favor
-- of one admin-editable percentage, applied uniformly regardless of which currency is on the
-- non-CNY side of the conversion. This is the "single source of truth for all fiat-to-CNY
-- pricing" piece — Convert CNY's lock-in and Pay to China's displayed rate both read this same
-- value now, so they can't drift out of sync the way two independently-tuned numbers could.
--
-- A singleton table (single row enforced via a check constraint on a fixed id) rather than a
-- generic key-value settings table — there's exactly one value to store today, and no existing
-- generic settings table in this schema to extend (confirmed: none exists).

create table cny_markup_rate (
  id boolean primary key default true,
  markup_rate numeric(5, 4) not null,
  updated_at timestamptz not null default now(),
  constraint cny_markup_rate_singleton check (id)
);

insert into cny_markup_rate (markup_rate) values (0.02);

alter table cny_markup_rate enable row level security;

create policy "cny_markup_rate: read all" on cny_markup_rate for select using (true);
-- No insert/update policy for regular users — only the service-role client (from an admin-gated
-- server action) writes here, same pattern as every other admin_* table.

create or replace function admin_set_cny_markup_rate(p_markup_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_markup_rate < 0 or p_markup_rate >= 1 then
    raise exception 'Markup must be between 0 and 1 (e.g. 0.02 for 2%%)';
  end if;

  update cny_markup_rate
  set markup_rate = p_markup_rate, updated_at = now()
  where id = true;
end;
$$;

-- admin_set_cny_markup_rate is only ever called via the service-role client from an admin-gated
-- server action, same as every other admin_* function — no self-check needed.
