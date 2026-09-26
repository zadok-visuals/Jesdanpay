import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { attemptAutomatedPayout, AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS } from "@/lib/withdrawals/automated-payout";

// Retries withdrawals whose automated Busha payout attempt failed before a transfer was ever
// created (see attemptAutomatedPayout's catch block, src/lib/withdrawals/automated-payout.ts) —
// these rows are invisible to reconcile-busha-transfers (provider is still 'manual', not 'busha')
// and would otherwise sit in the manual admin queue forever with no indication they were ever
// supposed to be automatic. Migration 0030 adds the failure-reason + retry-count columns this
// queries against.
//
// Same external-scheduler caveat as reconcile-busha-transfers / reconcile-deposits: needs
// cron-job.org (or equivalent) wired up, every 15 minutes, with header
// `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[retry-withdrawal-automation] rejected call with missing/invalid Authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: candidates } = await admin
    .from("transactions")
    .select("id, user_id, currency, amount")
    .eq("type", "withdrawal")
    .eq("status", "pending")
    .eq("provider", "manual")
    .not("automated_payout_attempt_failed_reason", "is", null)
    .lt("automated_payout_retry_count", AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS);

  console.log("[retry-withdrawal-automation] run started", {
    candidateCount: candidates?.length ?? 0,
  });

  for (const tx of candidates ?? []) {
    await attemptAutomatedPayout(tx.id, tx.user_id, tx.currency, tx.amount);
  }

  console.log("[retry-withdrawal-automation] run finished", { retried: candidates?.length ?? 0 });
  return NextResponse.json({ retried: candidates?.length ?? 0 });
}
