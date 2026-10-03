-- Migration 0040: in-app chat support between users and admins.
--
-- No support/chat mechanism existed anywhere in the app. One thread per user (identified by
-- user_id), messages tagged by who sent them. Admins always read/write via the service-role
-- client (same convention as every other admin-only data path in this schema) — the policies
-- below only cover the user's own side: reading their own thread, sending as themselves (never
-- able to insert a message impersonating 'admin'), and marking their own thread's messages read.

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index support_messages_user_id_created_at_idx on support_messages (user_id, created_at);

alter table support_messages enable row level security;

create policy "support_messages: read own thread" on support_messages for select using (auth.uid() = user_id);

create policy "support_messages: send own messages" on support_messages
  for insert with check (auth.uid() = user_id and sender = 'user');

create policy "support_messages: mark own thread read" on support_messages
  for update using (auth.uid() = user_id);
