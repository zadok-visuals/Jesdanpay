-- Migration 0013: add the country_code enum and a nullable `country` column on profiles.
--
-- Its own migration/script — Postgres forbids referencing a newly added enum type/value in the
-- same transaction that created it, and the Supabase SQL Editor runs a pasted script as one
-- implicit transaction. See 0002's header comment for the full explanation.
--
-- Only the three countries JesDanPay currently supports are valid values — Nigeria, Ghana,
-- Kenya (mirrors which local-currency wallets exist at all: NGN/GHS/KES).

create type country_code as enum ('NG', 'GH', 'KE');

alter table profiles add column if not exists country country_code;
