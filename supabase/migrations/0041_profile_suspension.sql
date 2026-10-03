-- Migration 0041: admin suspend/release for user accounts.
--
-- profiles had no status/suspended field at all — an admin had no way to temporarily block a
-- user from the dashboard without deleting their account outright. suspended_at doubles as both
-- the flag (null = active) and the timestamp of when it happened; suspension_reason is optional
-- free text shown back to the user on /account-suspended.

alter table profiles add column suspended_at timestamptz;
alter table profiles add column suspension_reason text;
