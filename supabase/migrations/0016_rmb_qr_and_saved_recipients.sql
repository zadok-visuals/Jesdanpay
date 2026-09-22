-- Migration 0016: QR code recipient upload + saved beneficiaries for the RMB exchange flow.
--
-- QR upload is an alternative INPUT method to typing an Alipay/WeChat ID, not an automatic
-- decoder — the uploaded image is stored for the admin to reference during manual settlement
-- (they already process every RMB request by hand), same spirit as every other manual-OTC piece
-- of this flow. Decoding it programmatically would need a dedicated library/OCR pass that isn't
-- required for the admin-mediated model this app already runs on.

-- ── 1. Recipient QR code image ────────────────────────────────────────────────────
alter table rmb_recipients add column if not exists qr_code_ref text;

-- ── 2. Saved beneficiaries ─────────────────────────────────────────────────────────
-- Separate from rmb_recipients (always tied to one transaction) so a user can keep a reusable
-- recipient without it being attached to any particular transfer.
create table saved_rmb_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  label text not null,
  payout_method payout_method not null,
  recipient_alipay_id text,
  recipient_wechat_id text,
  recipient_bank_account_number text,
  recipient_bank_name text,
  recipient_account_holder_name text,
  qr_code_ref text,
  created_at timestamptz not null default now()
);

alter table saved_rmb_recipients enable row level security;

create policy "saved_rmb_recipients: read own" on saved_rmb_recipients for select using (auth.uid() = user_id);
create policy "saved_rmb_recipients: insert own" on saved_rmb_recipients for insert with check (auth.uid() = user_id);
create policy "saved_rmb_recipients: delete own" on saved_rmb_recipients for delete using (auth.uid() = user_id);

-- ── 3. Private storage bucket for recipient QR code uploads ──────────────────────
insert into storage.buckets (id, name, public)
values ('rmb-recipient-qr', 'rmb-recipient-qr', false)
on conflict (id) do nothing;

create policy "rmb-recipient-qr: read own folder" on storage.objects
  for select using (
    bucket_id = 'rmb-recipient-qr' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "rmb-recipient-qr: upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'rmb-recipient-qr' and auth.uid()::text = (storage.foldername(name))[1]
  );
