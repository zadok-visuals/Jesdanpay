-- Migration 0037: in-app admin-to-user notifications.
--
-- No notifications table existed anywhere in the previous 36 migrations, and the dashboard's own
-- settings page had a literal "Notification preferences... coming soon" stub with no path forward.
-- In-app only for now (no email/SMS/push, future scope) — a broadcast-to-all message is a row
-- with user_id = null; a targeted message has a real user_id. Only the service-role client (from
-- the admin-gated compose action, src/app/admin/notifications/page.tsx) ever inserts a row, so
-- there's no insert policy for regular users at all, same convention as every other admin-written
-- table in this schema.
--
-- KNOWN SIMPLIFICATION: a single read_at column on the row (not a per-user join table) means a
-- broadcast notification's read state is shared across every recipient — the first user to open
-- it marks it read for everyone who was sent it, not just themselves. Accepted deliberately to
-- keep this simple, matching the exact schema asked for; a per-user read-receipts table would be
-- the real fix if that shared-read behavior ever becomes a problem in practice.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;

create policy "notifications: read own or broadcast" on notifications
  for select using (user_id = auth.uid() or user_id is null);

-- Lets a user mark their own (or a broadcast) notification read directly from their own session,
-- no server action / RPC needed — see the shared-read-state caveat above for the one known
-- tradeoff of allowing this on a broadcast row.
create policy "notifications: mark own or broadcast read" on notifications
  for update using (user_id = auth.uid() or user_id is null);
