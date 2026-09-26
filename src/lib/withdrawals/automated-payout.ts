import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import { getPayoutChannel, createBushaRecipient, createPayoutTransfer } from "@/lib/busha/payout";

// Amounts at or below this USDT-equivalent are automated via Busha's payout API; anything above
// stays on the manual admin-approval path, now additionally gated on extra identity verification
// (see migration 0027) before an admin can mark it paid out.
const AUTOMATED_PAYOUT_USDT_THRESHOLD = 1000;

// After this many failed automation attempts (see migration 0030), retry-withdrawal-automation
// stops retrying and leaves the row for manual review.
export const AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS = 3;

async function clearAutomatedPayoutFailure(admin: ReturnType<typeof createAdminClient>, transactionId: string) {
  await admin
    .from("transactions")
    .update({ automated_payout_attempt_failed_reason: null, automated_payout_retry_count: 0 })
    .eq("id", transactionId);
}

// Attempts an automated Busha payout for a withdrawal create_withdrawal_request just approved
// (wallet already debited, transaction row already inserted as pending/manual). Any failure here
// — a Busha error, an unsupported currency, missing recipient details — must never throw past
// this function: the transaction simply stays exactly as create_withdrawal_request left it, and
// falls back to the existing manual admin queue. A user's already-debited withdrawal must never
// be stranded by a payout-API hiccup.
//
// Called both synchronously from requestWithdrawal (src/lib/actions/withdrawals.ts) right after
// the withdrawal is created, and later by the retry-withdrawal-automation cron
// (src/app/api/cron/retry-withdrawal-automation/route.ts) for rows whose first attempt threw
// before a Busha transfer was ever created — see that route and migration 0030 for why a genuine
// mid-flight failure needs to be distinguishable from the >1,000 USDT manual-by-design case (the
// threshold/unsupported-currency/no-recipient branches below all `return` cleanly and never reach
// the `catch`, so reaching `catch` here always means "this was a real automation candidate that
// broke," never the ordinary manual case).
export async function attemptAutomatedPayout(transactionId: string, userId: string, currency: Currency, amount: number) {
  const admin = createAdminClient();
  try {
    // Neither the rate probe nor the recipient fetch depends on the other — kick both off
    // together instead of a fully sequential round trip. The recipient is fetched even when the
    // threshold check below ends up skipping automation entirely; that's one small wasted read
    // in the (less common) over-threshold case, worth it for cutting real latency in the common
    // under-threshold path.
    const [usdtRate, recipientResult] = await Promise.all([
      currency === "USDT" ? Promise.resolve(1) : probeFiatToUsdtRate(currency),
      admin.from("withdrawal_recipients").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    const usdtEquivalent = currency === "USDT" ? amount : amount * usdtRate;
    const recipient = recipientResult.data;

    if (usdtEquivalent > AUTOMATED_PAYOUT_USDT_THRESHOLD) {
      await admin.rpc("flag_withdrawal_for_verification", { p_transaction_id: transactionId });
      return;
    }

    if (!getPayoutChannel(currency)) {
      // Definitively not automatable — clear any stale reason from an earlier, different failed
      // attempt so the admin badge doesn't linger and the retry cron doesn't keep retrying a
      // currency that can never succeed (this branch never increments the retry counter).
      await clearAutomatedPayoutFailure(admin, transactionId);
      return;
    }
    if (!recipient) {
      await clearAutomatedPayoutFailure(admin, transactionId);
      return;
    }

    let recipientId = recipient.busha_recipient_id;
    if (!recipientId) {
      recipientId = await createBushaRecipient(currency, recipient);
      await admin.from("withdrawal_recipients").update({ busha_recipient_id: recipientId }).eq("user_id", userId);
    }

    const transfer = await createPayoutTransfer(currency, amount, recipientId);
    await admin.rpc("mark_withdrawal_processing", {
      p_transaction_id: transactionId,
      p_provider_reference: transfer.id,
    });
    await clearAutomatedPayoutFailure(admin, transactionId);

    // Same "complete synchronously when Busha's own response already confirms it, otherwise let
    // reconciliation catch it" pattern executeSwap already uses. funds_delivered is Busha's
    // documented terminal status for payouts/withdrawals specifically.
    if (transfer.status === "funds_delivered") {
      await admin.rpc("complete_withdrawal_payout", { p_transaction_id: transactionId });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[attemptAutomatedPayout] automated payout failed, leaving for manual review", {
      transactionId,
      currency,
      error: reason,
    });
    await admin.rpc("record_automated_payout_failure", {
      p_transaction_id: transactionId,
      p_reason: reason.slice(0, 500),
    });
  }
}
