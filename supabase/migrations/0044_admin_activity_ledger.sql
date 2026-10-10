-- Migration 0044: a single admin-only ledger of every user-facing money movement.
--
-- WHY THIS EXISTS: the admin dashboard (src/app/admin/page.tsx) and the transactions screen
-- (src/app/admin/transactions/page.tsx) only ever looked at the `transactions` table — but
-- deposits live in their own `deposits` table and CNY conversions in `cny_conversions`. A
-- confirmed deposit of 100,000 NGN simply never appeared in "Total volume" or "Last 24 hours",
-- and there was no way at all to see which user made it short of manually searching every
-- profile's email. Supabase/PostgREST also caps a single response at 1000 rows, so even the
-- transactions-only totals were silently truncating as volume grew — summed in JS from fetched
-- rows, not a real aggregate. This view unions all three sources into one consistent shape (one
-- row per deposit, per transaction, per conversion) with the owning user's name/email/phone
-- already joined on, so both pages can page through or aggregate ONE thing instead of three, and
-- admin_ledger_totals (part c below) replaces the JS-side summing with a real SQL aggregate that
-- can't be truncated by the row cap.
--
-- MUST BE PASTED INTO THE SUPABASE SQL EDITOR BY HAND — this repo has no migration runner wired
-- up to apply files automatically.

-- ── (a) The ledger itself ───────────────────────────────────────────────────────────────────
-- Same column list and types across all three branches (required for UNION ALL): `kind` is the
-- user-facing category (deposit / swap / china_payment / withdrawal / cny_conversion); `source`
-- is which underlying table the row actually came from, kept mostly for debugging. `fee` is only
-- ever populated for a withdrawal (amount - target_amount); every other kind leaves it null
-- rather than guessing at a "fee" that doesn't apply. LEFT JOIN to profiles, not INNER — a
-- financial record should never silently vanish from this ledger just because a profile lookup
-- happened to miss.
create view admin_activity_ledger as
select
  'deposit'::text as source,
  'deposit'::text as kind,
  d.id,
  d.user_id,
  p.email as user_email,
  p.full_name as user_name,
  p.phone as user_phone,
  d.currency,
  coalesce(d.confirmed_amount, d.amount) as amount,
  null::currency as target_currency,
  null::numeric as target_amount,
  null::numeric as fee,
  d.status,
  d.provider_reference as reference,
  d.provider::text as provider,
  d.created_at
from deposits d
left join profiles p on p.id = d.user_id

union all

select
  'transaction'::text as source,
  case t.type
    when 'usdt_ngn' then 'swap'
    when 'rmb_manual' then 'china_payment'
    when 'rmb_auto' then 'china_payment'
    when 'withdrawal' then 'withdrawal'
  end as kind,
  t.id,
  t.user_id,
  p.email as user_email,
  p.full_name as user_name,
  p.phone as user_phone,
  t.currency,
  t.amount,
  t.target_currency,
  t.target_amount,
  case when t.type = 'withdrawal' then t.amount - t.target_amount else null end as fee,
  t.status,
  t.provider_reference as reference,
  t.provider::text as provider,
  t.created_at
from transactions t
left join profiles p on p.id = t.user_id

union all

select
  'conversion'::text as source,
  'cny_conversion'::text as kind,
  c.id,
  c.user_id,
  p.email as user_email,
  p.full_name as user_name,
  p.phone as user_phone,
  c.from_currency as currency,
  c.from_amount as amount,
  c.to_currency as target_currency,
  c.to_amount as target_amount,
  null::numeric as fee,
  'completed'::transaction_status as status,
  null::text as reference,
  null::text as provider,
  c.created_at
from cny_conversions c
left join profiles p on p.id = c.user_id;

-- ── (b) Lock it down to the service role only ───────────────────────────────────────────────
-- A Postgres view runs with the privileges of its OWNER by default (not the querying role), so
-- without this, any authenticated user granted select on the view would see EVERY user's
-- deposits/transactions/conversions, not just their own — the underlying tables' own RLS
-- policies would never even be consulted. Every admin page already reads through
-- createAdminClient() (the service-role key), so there is no legitimate reason for anon or
-- authenticated to ever touch this view directly.
revoke all on admin_activity_ledger from public, anon, authenticated;
grant select on admin_activity_ledger to service_role;

-- ── (c) SQL-side aggregation, so a 1000-row page cap can never silently truncate a total ──────
-- Replaces every "fetch rows, sum them in JS" pattern the admin dashboard and PNL page used
-- before this. Grouped by kind/currency/status so a caller can slice it however it needs — e.g.
-- completed deposit volume per currency, or a single "last 24h" total across every kind.
create or replace function admin_ledger_totals(p_since timestamptz default null)
returns table (kind text, currency text, status text, txn_count bigint, total_amount numeric)
language sql
security definer
set search_path = public
as $$
  select
    kind,
    currency::text,
    status::text,
    count(*)::bigint as txn_count,
    coalesce(sum(amount), 0)::numeric as total_amount
  from admin_activity_ledger
  where p_since is null or created_at >= p_since
  group by kind, currency, status;
$$;

revoke all on function admin_ledger_totals(timestamptz) from public;
grant execute on function admin_ledger_totals(timestamptz) to service_role;
