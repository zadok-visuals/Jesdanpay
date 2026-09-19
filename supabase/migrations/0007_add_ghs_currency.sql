-- Migration 0007: add 'GHS' to the currency enum.
--
-- Its own migration/script — Postgres forbids referencing a newly added enum value in the
-- transaction that added it, and the Supabase SQL Editor runs a pasted script as one implicit
-- transaction. See 0002's header comment for the full explanation.
--
-- Note: this migration originally also added 'quidax' to transaction_provider, for a
-- swap-provider integration that was fully replaced by Busha (see 0009/0010) before ever
-- reaching production credentials. That line was removed here since the architecture it
-- supported no longer exists in this codebase. If you're working against a database that
-- already ran the original version of this file, `transaction_provider` still has a
-- harmless, permanently-unused 'quidax' value — Postgres can't drop enum values without
-- rebuilding the whole type, so it isn't worth removing there either.

alter type currency add value if not exists 'GHS';
