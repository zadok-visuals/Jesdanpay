-- Migration 0030: withdrawal automation retry gap.
--
-- attemptAutomatedPayout (src/lib/withdrawals/automated-payout.ts) silently swallowed failures
-- (rate probe / recipient fetch / Busha API errors) that happen before a Busha transfer is
-- created, leaving the transaction row exactly as create_withdrawal_request left it
-- (provider = 'manual', status = 'pending') — invisible to reconcile-busha-transfers (which only
-- polls provider = 'busha' rows) and indistinguishable in the admin queue from a normal
-- >1,000-USDT manual-by-design withdrawal. This adds a failure-reason column + retry counter so a
-- new cron (retry-withdrawal-automation) can find and retry these, and the admin queue can flag
-- them distinctly.

alter table transactions
  add column automated_payout_attempt_failed_reason text,
  add column automated_payout_retry_count integer not null default 0;

-- Called only from attemptAutomatedPayout's catch block via the service-role client — never by a
-- user's own session, so no grant to `authenticated`, same convention as mark_withdrawal_processing.
create function record_automated_payout_failure(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set automated_payout_attempt_failed_reason = p_reason,
      automated_payout_retry_count = automated_payout_retry_count + 1
  where id = p_transaction_id and type = 'withdrawal';
end;
$$;
