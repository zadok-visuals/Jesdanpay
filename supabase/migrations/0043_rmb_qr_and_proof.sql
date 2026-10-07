-- Migration 0043: fix the QR-only recipient crash, and add payment-proof support for RMB
-- (Send to China) completions.
--
-- MUST BE PASTED INTO THE SUPABASE SQL EDITOR BY HAND — this repo has no migration runner wired
-- up to apply files automatically.

-- ── (a) Fix rmb_recipients_alipay_check / rmb_recipients_wechat_check ───────────────────────
-- Migration 0024 required recipient_alipay_id (or recipient_wechat_id) to be not null on top of
-- the first/last name requirement — but src/lib/actions/payments.ts deliberately allows a
-- QR-code-only recipient with no typed Alipay/WeChat id (it stores qr_code_ref instead and leaves
-- the id column null). Every QR-only submission has therefore been failing with:
--   new row for relation "rmb_recipients" violates check constraint "rmb_recipients_alipay_check"
-- Fix: both names are still required, but the id requirement becomes "id OR qr_code_ref".
alter table rmb_recipients
  drop constraint rmb_recipients_alipay_check,
  drop constraint rmb_recipients_wechat_check;

alter table rmb_recipients
  add constraint rmb_recipients_alipay_check
    check (
      payout_method <> 'alipay' or (
        recipient_first_name is not null and
        recipient_last_name is not null and
        (recipient_alipay_id is not null or qr_code_ref is not null)
      )
    ),
  add constraint rmb_recipients_wechat_check
    check (
      payout_method <> 'wechat' or (
        recipient_first_name is not null and
        recipient_last_name is not null and
        (recipient_wechat_id is not null or qr_code_ref is not null)
      )
    );

-- ── (b) Where a completed request's payment proof screenshot lives ─────────────────────────
alter table transactions add column payment_proof_ref text;

-- ── (c) Lets a notification carry a link to that proof (or any future attachment) ──────────
alter table notifications add column attachment_ref text;

-- ── (d) Private storage bucket for admin-uploaded payment proof screenshots ────────────────
-- Mirrors the "kyc-documents" bucket's shape (migration 0001), minus an insert policy: the admin
-- is never the folder owner here (the folder is the CUSTOMER's user id, so the proof lives next
-- to everything else that customer owns), so there is no RLS path for an admin to insert directly.
-- Admin uploads instead go through a signed upload URL minted by the service-role client (see
-- createRmbProofUploadUrl, src/lib/actions/admin.ts), which bypasses RLS entirely by design.
insert into storage.buckets (id, name, public)
values ('rmb-payment-proof', 'rmb-payment-proof', false)
on conflict (id) do nothing;

create policy "rmb-payment-proof: read own folder" on storage.objects
  for select using (
    bucket_id = 'rmb-payment-proof' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── (e) admin_complete_rmb_transaction gains an optional proof reference ───────────────────
-- create or replace can't add a new parameter to an existing function (that creates a second,
-- overloaded function instead of replacing this one, since Postgres identifies a function by
-- name + parameter types) — so the old 3-arg version must be dropped first.
drop function if exists admin_complete_rmb_transaction(uuid, numeric, text);

create or replace function admin_complete_rmb_transaction(
  p_transaction_id uuid,
  p_actual_target_amount numeric,
  p_note text,
  p_proof_ref text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actual_target_amount <= 0 then
    raise exception 'Actual delivered amount must be greater than zero';
  end if;

  update transactions
  set status = 'completed',
      target_currency = 'CNY',
      actual_target_amount = p_actual_target_amount,
      actual_rate_note = p_note,
      payment_proof_ref = p_proof_ref
  where id = p_transaction_id and type = 'rmb_manual';
end;
$$;

-- Only ever called via the service-role client from an admin-gated server action, same as every
-- other admin_* function — no grant to authenticated, no self-check needed.
