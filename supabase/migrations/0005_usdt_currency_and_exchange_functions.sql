-- Migration 0005: USDT wallet support + atomic USDT<->NGN exchange functions.
--
-- Unlike Klasha/RMB (OTC-only, see 0004), Busha has a real quote+transfer API. This
-- is a pure balance conversion inside the user's own wallet (no external recipient),
-- settled asynchronously — the transfer is created immediately but Busha confirms
-- completion via webhook, so crediting the target wallet happens on webhook receipt,
-- not at request time.

-- ── 1. Extend currency enum ──────────────────────────────────────────────────
-- Must be its own statement/commit before anything below references the new value —
-- see 0002's header comment for why (Postgres forbids using a new enum value in the
-- same transaction that added it, and a pasted multi-statement SQL Editor script runs
-- as one implicit transaction).
alter type currency add value if not exists 'USDT';
