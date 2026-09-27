-- Migration 0033: KYC rejection reason + a real uniqueness constraint for resubmission.
--
-- admin_reject_kyc previously took only a user id, no reason — the user-facing status page always
-- showed the same generic "please review and resubmit" message regardless of what was actually
-- wrong. Also: kyc_documents had no uniqueness constraint on (user_id, document_type), so a
-- resubmission after rejection just inserted brand-new rows alongside the old rejected ones
-- instead of replacing them — confirmed by reading src/lib/actions/kyc.ts's plain .insert() calls.

alter table profiles add column kyc_rejection_reason text;

alter table kyc_documents
  add constraint kyc_documents_user_document_type_key unique (user_id, document_type);

-- The resubmission fix in src/lib/actions/kyc.ts upserts against the constraint above (replacing
-- an existing document_type row instead of duplicating it) via the user's own session, not the
-- service-role client — an upsert's ON CONFLICT DO UPDATE path needs an UPDATE policy to succeed
-- under RLS, and only "insert own" existed before this (migration 0001).
create policy "kyc_documents: update own" on kyc_documents for update using (auth.uid() = user_id);

create or replace function admin_reject_kyc(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set kyc_status = 'rejected', kyc_rejection_reason = p_reason
  where id = p_user_id;

  update kyc_documents
  set status = 'rejected'
  where user_id = p_user_id and status = 'pending';
end;
$$;

-- admin_reject_kyc is only ever called via the service-role client from an admin-gated server
-- action, same as every other admin_* function — no grant to authenticated, no self-check needed.
