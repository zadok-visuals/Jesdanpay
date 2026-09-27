-- Migration 0034: clear stale Paystack-sourced NGN bank codes.
--
-- withdrawal_recipients.bank_code for existing NGN rows was sourced from Paystack's public bank
-- list (standard NIBSS codes) — confirmed directly with Busha support that their ngn_bank
-- recipient type expects Busha's own internal bank codes instead, not NIBSS codes, so every
-- existing NGN bank_code value here is wrong and Busha will keep rejecting it. Also clear
-- busha_recipient_id (any recipient already created at Busha for one of these rows was built from
-- the wrong bank_code too) so attemptAutomatedPayout is forced to create a fresh one next time.
--
-- Nulling both columns makes createBushaRecipient's existing "Missing bank details for
-- automated payout" check (src/lib/busha/payout.ts) fire naturally for these rows — the same
-- fallback-to-manual-queue path that already exists for a recipient with no bank_code at all —
-- rather than silently retrying a bank_code Busha will keep rejecting. The next time an affected
-- user opens Settings, the bank picker (now sourced from Busha's own GET /v1/banks) shows they
-- need to re-pick their bank.

update withdrawal_recipients
set bank_code = null, busha_recipient_id = null
where currency = 'NGN';
