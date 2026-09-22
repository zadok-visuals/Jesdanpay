-- Migration 0017: add 'withdrawal' to the transaction_type enum.
--
-- Its own migration/script — Postgres forbids referencing a newly added enum value in the
-- transaction that added it, and the Supabase SQL Editor runs a pasted script as one implicit
-- transaction. See 0002's header comment for the full explanation.

alter type transaction_type add value if not exists 'withdrawal';
