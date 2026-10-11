import { createAdminClient } from "@/lib/supabase/admin";
import { sendWithdrawalCompletedEmail, sendWithdrawalFailedEmail } from "@/lib/email";

// Shared by every place a withdrawal can actually resolve — the synchronous branch inside
// attemptAutomatedPayout, the Busha webhook, the reconcile-busha-transfers cron, and an admin's
// own manual completeWithdrawal/rejectWithdrawal (src/lib/actions/admin.ts) — so none of those
// four call sites has to duplicate "fetch the transaction + profile, write a notification row,
// send the dedicated email" on its own. Always best-effort: called only AFTER the real
// complete_withdrawal_payout/fail_withdrawal_payout (or admin_* equivalent) RPC has already
// succeeded, so a failure in here must never be treated as the withdrawal itself failing.
export async function notifyWithdrawalOutcome(
  admin: ReturnType<typeof createAdminClient>,
  transactionId: string,
  outcome: "completed" | "failed",
): Promise<void> {
  const { data: tx } = await admin
    .from("transactions")
    .select("user_id, amount, currency, target_amount")
    .eq("id", transactionId)
    .eq("type", "withdrawal")
    .maybeSingle();
  if (!tx) {
    console.error("[notifyWithdrawalOutcome] transaction not found", { transactionId, outcome });
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", tx.user_id)
    .maybeSingle();

  const netAmount = tx.target_amount ?? tx.amount;
  const title = outcome === "completed" ? "Your withdrawal is complete" : "Your withdrawal could not be completed";
  const body =
    outcome === "completed"
      ? `${tx.currency} ${netAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} was sent to your saved recipient.`
      : `We could not complete your withdrawal of ${tx.currency} ${tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}. The full amount has been returned to your balance.`;

  const { error: notifyError } = await admin
    .from("notifications")
    .insert({ user_id: tx.user_id, title, body });
  if (notifyError) {
    console.error("[notifyWithdrawalOutcome] notification insert failed", { transactionId, error: notifyError });
  }

  if (!profile?.email) {
    console.warn("[notifyWithdrawalOutcome] no email on file, skipping email", { transactionId });
    return;
  }

  const userName = profile.full_name ?? profile.email;
  const result =
    outcome === "completed"
      ? await sendWithdrawalCompletedEmail({
          userName,
          userEmail: profile.email,
          amount: tx.amount,
          currency: tx.currency,
          netAmount,
          reference: transactionId,
        })
      : await sendWithdrawalFailedEmail({
          userName,
          userEmail: profile.email,
          amount: tx.amount,
          currency: tx.currency,
          reference: transactionId,
        });

  if (!result.sent) {
    console.error("[notifyWithdrawalOutcome] email not sent", { transactionId, outcome, reason: result.reason });
  }
}
