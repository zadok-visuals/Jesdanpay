-- Migration 0039: correct the admin_users seed from 0038.
--
-- 0038's seed matched ADMIN_EMAILS (michaeljustus30@gmail.com) against profiles.email and found
-- no match — that address has never actually signed up in this project, so admin_users was left
-- empty (requireAdminUser() has been running on the ADMIN_EMAILS fallback since 0038 shipped,
-- completely unaffected). Confirmed directly with the project owner: the real admin login is
-- admin@jesdanpay.net (the earliest account in this project, created 2026-07-25). Seeding that
-- one as super_admin here — once this inserts, admin_users has its first row and becomes the
-- sole source of truth per 0038's own fallback rule.

insert into admin_users (id, role)
select p.id, 'super_admin'
from profiles p
where lower(p.email) = 'admin@jesdanpay.net'
on conflict (id) do nothing;
