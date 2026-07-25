-- Migration 0002: add 'CNY' to the currency enum.
--
-- This is split into its own migration/script on purpose. Postgres does not
-- allow a newly added enum value to be referenced by any statement in the
-- same transaction that added it ("unsafe use of new value of enum type").
-- The Supabase SQL Editor (and psql running a multi-statement file) executes
-- a pasted script as a single implicit transaction, so 0003's use of 'CNY'
-- would fail if it were bundled into this same script. Run this migration
-- first, let it commit, then run 0003 separately.

alter type currency add value if not exists 'CNY';
