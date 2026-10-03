-- Migration 0038: role-backed admin access (admin_users) + a sign-in/out audit trail
-- (admin_login_log).
--
-- Admin access was purely the ADMIN_EMAILS env var, string-matched in requireAdminUser() — no
-- database backing, no roles, no record of who actually logged into the admin panel and when.
-- This moves the authoritative access list into the database, seeded below from ADMIN_EMAILS as
-- it was configured at the time this migration was written, so nobody currently listed loses
-- access. requireAdminUser() keeps the raw env var check only as a safety-net fallback for the
-- case where admin_users is completely empty (e.g. this migration hasn't run yet in some
-- environment) — once it has ANY rows, it's the sole source of truth: removing someone's
-- admin_users row actually revokes their access even if they're still listed in ADMIN_EMAILS.
-- Going forward, admins are added/removed through the Administrators screen
-- (src/app/admin/administrators), not by editing ADMIN_EMAILS again.
--
-- admin_users.id doubles as the primary key AND the FK to profiles — one row per admin, keyed by
-- their own user id, no separate surrogate id needed.

create table admin_users (
  id uuid primary key references profiles (id) on delete cascade,
  role text not null check (role in ('super_admin', 'admin')),
  created_at timestamptz not null default now()
);

-- RLS enabled with NO policies at all, deliberately — only the service-role client (used
-- exclusively from admin-gated server code: requireAdminUser(), the Administrators screen) ever
-- touches this table. Unlike cny_tier_rates/supplier_rates (which need a public or
-- authenticated-read policy for legitimate non-admin use cases), there's no legitimate reason any
-- regular user session should ever read who the admins are.
alter table admin_users enable row level security;

create table admin_login_log (
  id uuid primary key default gen_random_uuid(),
  -- Cascades on admin removal — revoking access and losing that admin's own login history
  -- together is the simple, defensible behavior here; this is an access-audit log scoped to a
  -- still-active admin, not a permanent compliance record.
  admin_user_id uuid not null references admin_users (id) on delete cascade,
  event text not null check (event in ('sign_in', 'sign_out')),
  created_at timestamptz not null default now()
);

create index admin_login_log_admin_user_id_created_at_idx on admin_login_log (admin_user_id, created_at desc);

alter table admin_login_log enable row level security;

-- One-time bootstrap seed, matched against existing profiles.email. The first entry becomes
-- 'super_admin', every subsequent one 'admin' — with only one address configured right now, that
-- one person becomes the sole super_admin.
insert into admin_users (id, role)
select p.id, v.role
from (values
  ('michaeljustus30@gmail.com', 'super_admin')
) as v(email, role)
join profiles p on lower(p.email) = lower(v.email)
on conflict (id) do nothing;
