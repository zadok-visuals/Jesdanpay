-- Migration 0007: add 'GHS' to the currency enum and 'quidax' to the provider enum.
--
-- Each ADD VALUE must be its own migration/script — Postgres forbids referencing a newly
-- added enum value in the same transaction that added it, and the Supabase SQL Editor runs
-- a pasted multi-statement script as one implicit transaction. See 0002's header comment for
-- the full explanation; this is the same rule applied to two enums instead of one.

alter type currency add value if not exists 'GHS';
alter type transaction_provider add value if not exists 'quidax';
