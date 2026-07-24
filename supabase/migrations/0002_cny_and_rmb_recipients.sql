-- Migration 0002: CNY wallet support and RMB recipient details
--
-- 1. Extend the `currency` enum with 'CNY'.
-- 2. Add a `payout_method` enum (alipay | wechat | bank).
-- 3. Create the `rmb_recipients` table — stores recipient detail for each RMB
--    send attempt. Linked to `transactions.id` once Milestone 2 executes the
--    exchange; nullable until then so recipients can be captured at UI time.
-- 4. Update handle_new_user to also create a zero-balance CNY wallet.
-- 5. Back-fill a CNY wallet for existing users.
--
-- Run this whole file in one go in the Supabase SQL Editor (or `supabase db
-- push`). The `commit;` after step 1 is required, not optional: Postgres
-- forbids using a newly added enum value in the same transaction that added
-- it, and step 5 below inserts rows using 'CNY' directly. Without the
-- explicit commit here, the whole script fails with:
--   "unsafe use of new value of enum type currency"
-- Postgres respects explicit BEGIN/COMMIT embedded in a multi-statement
-- script, so this closes out the first implicit transaction and lets
-- everything after it run — and see 'CNY' as already committed — in a
-- fresh one, all within this single file/run.

-- ── 1. Extend currency enum ──────────────────────────────────────────────────
alter type currency add value if not exists 'CNY';

commit;

-- ── 2. Payout method enum ────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payout_method') then
    create type payout_method as enum ('alipay', 'wechat', 'bank');
  end if;
end$$;

-- ── 3. rmb_recipients table ──────────────────────────────────────────────────
create table if not exists rmb_recipients (
  id                           uuid primary key default gen_random_uuid(),
  -- Nullable until M2 executes the exchange and writes the transactions row.
  transaction_id               uuid references transactions (id) on delete set null,
  user_id                      uuid not null references profiles (id) on delete cascade,
  payout_method                payout_method not null,
  -- Alipay
  recipient_alipay_id          text,
  -- WeChat Pay
  recipient_wechat_id          text,
  -- Bank account (all three required when method = 'bank')
  recipient_bank_account_number text,
  recipient_bank_name           text,
  recipient_account_holder_name text,
  created_at                   timestamptz not null default now(),

  -- Enforce that the right fields are filled per method.
  constraint rmb_recipients_alipay_check
    check (payout_method <> 'alipay' or recipient_alipay_id is not null),
  constraint rmb_recipients_wechat_check
    check (payout_method <> 'wechat' or recipient_wechat_id is not null),
  constraint rmb_recipients_bank_check
    check (
      payout_method <> 'bank' or (
        recipient_bank_account_number is not null and
        recipient_bank_name           is not null and
        recipient_account_holder_name is not null
      )
    )
);

-- ── 4. RLS on rmb_recipients ─────────────────────────────────────────────────
alter table rmb_recipients enable row level security;

create policy "rmb_recipients: read own"
  on rmb_recipients for select
  using (auth.uid() = user_id);

create policy "rmb_recipients: insert own"
  on rmb_recipients for insert
  with check (auth.uid() = user_id);

-- ── 5. Auto-provision CNY wallet on new signup ───────────────────────────────
-- Replace the existing trigger function so new users get USD + NGN + CNY.
-- Note: `create or replace function` is safe here; the trigger itself remains.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

  insert into public.wallets (user_id, currency)
  values (new.id, 'USD'), (new.id, 'NGN'), (new.id, 'CNY');

  return new;
end;
$$;

-- ── 6. Back-fill CNY wallet for existing users ───────────────────────────────
-- Idempotent: insert where the row doesn't already exist.
insert into public.wallets (user_id, currency, balance)
select id, 'CNY', 0
from public.profiles
where not exists (
  select 1 from public.wallets
  where wallets.user_id = profiles.id
    and wallets.currency = 'CNY'
);
