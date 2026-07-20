-- JesDanPay initial schema: profiles, wallets, KYC documents, and forward-compatible
-- transactions/webhook_events tables (unused until Milestone 2's Klasha/Busha integration).

create type kyc_type as enum ('individual', 'business');
create type kyc_status as enum ('not_started', 'pending', 'approved', 'rejected');
create type kyc_tier as enum ('individual_tier_1', 'individual_tier_2', 'individual_tier_3', 'business');
create type currency as enum ('USD', 'NGN');
create type document_status as enum ('pending', 'approved', 'rejected');
create type transaction_type as enum ('rmb_manual', 'rmb_auto', 'usdt_ngn');
create type transaction_provider as enum ('klasha', 'busha');
create type transaction_status as enum ('pending', 'processing', 'completed', 'failed');

-- profiles: one row per auth.users row, holds product-level profile + KYC state
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  business_name text,
  kyc_type kyc_type,
  kyc_status kyc_status not null default 'not_started',
  created_at timestamptz not null default now()
);

-- wallets: one row per user per currency
create table wallets (
  user_id uuid not null references profiles (id) on delete cascade,
  currency currency not null,
  balance numeric(18, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, currency)
);

-- kyc_documents: one row per required KYC input for a tier. File-based inputs
-- (selfie, CAC certificate, director ID, proof of address) set file_ref, pointing
-- into the private "kyc-documents" storage bucket. Text-based inputs (BVN/NIN,
-- TIN, ownership structure) set value instead. We only store a pointer/raw input
-- for later review, not verification results.
create table kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  tier kyc_tier not null,
  document_type text not null,
  file_ref text,
  value text,
  status document_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint kyc_documents_has_content check (file_ref is not null or value is not null)
);

-- transactions / webhook_events: schema defined now per the product's data model,
-- populated starting in Milestone 2 (Klasha/Busha integration). No app code touches
-- these tables yet.
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type transaction_type not null,
  provider transaction_provider not null,
  status transaction_status not null default 'pending',
  amount numeric(18, 2) not null,
  currency currency not null,
  provider_reference text,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider transaction_provider not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Auto-provision a profile + zero-balance USD/NGN wallets whenever a new auth user signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

  insert into public.wallets (user_id, currency)
  values (new.id, 'USD'), (new.id, 'NGN');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Row Level Security: every table is private to its owning user. Service-role
-- (used by webhook receivers and admin tooling in later milestones) bypasses RLS.
alter table profiles enable row level security;
alter table wallets enable row level security;
alter table kyc_documents enable row level security;
alter table transactions enable row level security;
alter table webhook_events enable row level security;

create policy "profiles: read own" on profiles for select using (auth.uid() = id);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);

create policy "wallets: read own" on wallets for select using (auth.uid() = user_id);

create policy "kyc_documents: read own" on kyc_documents for select using (auth.uid() = user_id);
create policy "kyc_documents: insert own" on kyc_documents for insert with check (auth.uid() = user_id);

create policy "transactions: read own" on transactions for select using (auth.uid() = user_id);

-- No user-facing policies on webhook_events: only the service role (admin/backend) touches it.

-- Private storage bucket for KYC document uploads.
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

create policy "kyc-documents: read own folder" on storage.objects
  for select using (
    bucket_id = 'kyc-documents' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "kyc-documents: upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'kyc-documents' and auth.uid()::text = (storage.foldername(name))[1]
  );
