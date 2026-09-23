import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";

// Fallback safety net for `transactions` rows that depend on a Busha webhook to resolve — same
// rationale and shape as src/app/api/cron/reconcile-deposits, just for the `transactions` table
// instead of `deposits`. Covers both USDT swaps (type = 'usdt_ngn', see executeSwap in
// src/lib/actions/busha.ts, which only completes synchronously on an unambiguous immediate
// response) and, once automated withdrawal payouts are wired up, withdrawal payouts (type =
// 'withdrawal', provider = 'busha') — both are polled identically via getTransfer, only the
// completion/failure RPC differs by type.
//
// NOT called by Vercel's own Cron, same caveat as reconcile-deposits: the Hobby plan only allows
// a once-per-day schedule and rejects a more frequent vercel.json at deploy time. This needs an
// external scheduler (e.g. cron-job.org, every 15 minutes, with header
// `Authorization: Bearer <CRON_SECRET>`) wired up before this actually runs on a schedule — as of
// this commit it's reachable only by a manual call, exactly like reconcile-deposits.
const STALE_AFTER_MINUTES = 15;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[reconcile-busha-transfers] rejected call with missing/invalid Authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();

  const { data: staleTransactions } = await admin
    .from("transactions")
    .select("id, type, provider_reference")
    .eq("provider", "busha")
    .in("status", ["pending", "processing"])
    .lt("created_at", staleCutoff)
    .not("provider_reference", "is", null);

  console.log("[reconcile-busha-transfers] run started", {
    staleCount: staleTransactions?.length ?? 0,
  });

  const results: { transactionId: string; outcome: string }[] = [];

  for (const tx of staleTransactions ?? []) {
    if (!tx.provider_reference) continue;
    const isWithdrawal = tx.type === "withdrawal";
    const completeRpc = isWithdrawal ? "complete_withdrawal_payout" : "complete_busha_swap_transaction";
    const failRpc = isWithdrawal ? "fail_withdrawal_payout" : "fail_busha_swap_transaction";

    try {
      const transfer = await getTransfer(tx.provider_reference);
      if (transfer.status === "funds_converted" || transfer.status === "funds_delivered") {
        const { error } = await admin.rpc(completeRpc, { p_transaction_id: tx.id });
        if (error) {
          console.error(`[reconcile-busha-transfers] ${completeRpc} RPC failed`, { tx, error });
          results.push({ transactionId: tx.id, outcome: `complete failed: ${error.message}` });
        } else {
          console.log("[reconcile-busha-transfers] completed a stale transfer the webhook missed", {
            transactionId: tx.id,
            providerReference: tx.provider_reference,
          });
          results.push({ transactionId: tx.id, outcome: "completed" });
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const { error } = await admin.rpc(failRpc, { p_transaction_id: tx.id });
        if (error) {
          console.error(`[reconcile-busha-transfers] ${failRpc} RPC failed`, { tx, error });
        }
        results.push({ transactionId: tx.id, outcome: `marked failed (${transfer.status})` });
      } else {
        results.push({ transactionId: tx.id, outcome: `still ${transfer.status}` });
      }
    } catch (err) {
      console.error("[reconcile-busha-transfers] Busha lookup failed", { tx, err });
      results.push({ transactionId: tx.id, outcome: err instanceof Error ? err.message : "check failed" });
    }
  }

  console.log("[reconcile-busha-transfers] run finished", { checked: results.length, results });
  return NextResponse.json({ checked: results.length, results });
}
