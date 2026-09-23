-- Migration 0024: recipient first/last name for Alipay and WeChat Pay.
--
-- The Send to China flow only ever captured a single contact detail (phone
-- number or Alipay/WeChat handle) for these two payout methods — no separate
-- name field, unlike Bank Account which already has
-- `recipient_account_holder_name`. This adds `recipient_first_name` /
-- `recipient_last_name` to both `rmb_recipients` and `saved_rmb_recipients`,
-- and extends the existing per-method check constraints on `rmb_recipients`
-- so alipay/wechat rows can't be inserted without both names.
--
-- Both tables are confirmed empty in production (checked live before writing
-- this), so the new columns can be added and immediately constrained with no
-- backfill step.

-- ── 1. rmb_recipients ────────────────────────────────────────────────────────
alter table rmb_recipients
  add column recipient_first_name text,
  add column recipient_last_name  text;

alter table rmb_recipients
  drop constraint rmb_recipients_alipay_check,
  drop constraint rmb_recipients_wechat_check;

alter table rmb_recipients
  add constraint rmb_recipients_alipay_check
    check (
      payout_method <> 'alipay' or (
        recipient_alipay_id is not null and
        recipient_first_name is not null and
        recipient_last_name is not null
      )
    ),
  add constraint rmb_recipients_wechat_check
    check (
      payout_method <> 'wechat' or (
        recipient_wechat_id is not null and
        recipient_first_name is not null and
        recipient_last_name is not null
      )
    );

-- ── 2. saved_rmb_recipients ──────────────────────────────────────────────────
-- No check constraints on this table (mirrors 0016's original shape) — the
-- same first/last name required-ness is enforced at the application layer
-- when saving, matching how the other saved-recipient fields already work.
alter table saved_rmb_recipients
  add column recipient_first_name text,
  add column recipient_last_name  text;
