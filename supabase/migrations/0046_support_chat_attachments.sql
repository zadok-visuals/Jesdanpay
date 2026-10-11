-- Migration 0046: image attachments for the support chat.
--
-- MUST BE PASTED INTO THE SUPABASE SQL EDITOR BY HAND — this repo has no migration runner wired
-- up to apply files automatically.

-- ── (a) attachment_ref column, and body becomes optional (an image-only message has no text) ──
alter table support_messages add column attachment_ref text;
alter table support_messages alter column body drop not null;
alter table support_messages add constraint support_messages_body_or_attachment_check
  check (coalesce(trim(body), '') <> '' or attachment_ref is not null);

-- ── (b) private storage bucket for chat image attachments ─────────────────────────────────
-- Same shape as kyc-documents (migration 0001) and rmb-recipient-qr (migration 0016): one folder
-- per user, the user can read/write their own folder, nothing public. file_size_limit and
-- allowed_mime_types are enforced by Storage itself on every upload (including the admin's own,
-- via the signed-upload-url path — see createAdminSupportUploadUrl, src/lib/actions/support.ts),
-- so the 5MB/image-only limit can't be bypassed by a client that skips the app's own checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A real user can upload/read only their own folder (object path's first segment == their own
-- auth.uid()) — same policy shape as rmb-recipient-qr. The admin never has an RLS path into
-- another user's folder; admin uploads go through a signed upload URL minted by the service-role
-- client instead (bypasses RLS entirely by design, same as createRmbProofUploadUrl).
create policy "support-attachments: insert own folder" on storage.objects
  for insert with check (
    bucket_id = 'support-attachments' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "support-attachments: read own folder" on storage.objects
  for select using (
    bucket_id = 'support-attachments' and auth.uid()::text = (storage.foldername(name))[1]
  );
