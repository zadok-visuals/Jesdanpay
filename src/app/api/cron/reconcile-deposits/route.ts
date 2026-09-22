import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";

// Fallback safety net for the "deposits not reflecting" bug — independent of whether the
// webhook itself is healthy. Polls Busha's own API directly for any deposit that's been sitting
// pending for a while, in case its webhook delivery was ever lost, rejected, or simply never
// sent. Scoped to Busha only for now — GHS/Klasha deposits are blocked account-wide anyway (see
// src/lib/klasha/client.ts), so there's nothing to reconcile there yet.
//
// NOT called by Vercel's own Cron — the Hobby plan only allows a once-per-day schedule and
// rejects a more frequent vercel.json outright at deploy time (confirmed: this silently broke
// every deploy from the commit that first added it onward, including the original webhook fix
// this route was meant to back up — see the webhook route's header comment for the full story).
// This needs an external scheduler (e.g. cron-job.org, every 15 minutes, with header
// `Authorization: Bearer <CRON_SECRET>`) or a Vercel plan that supports frequent cron — as of
// this commit neither has been wired up yet, so this route is only reachable by a manual call.
// The checkDepositStatus poll (src/lib/actions/busha.ts) now does its own live Busha check as a
// second, independent safety net for a user actively watching the deposit screen, but a deposit
// nobody is actively watching still depends on this route actually being called on a schedule.
const STALE_AFTER_MINUTES = 15;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[reconcile-deposits] rejected call with missing/invalid Authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();

  const { data: staleDeposits } = await admin
    .from("deposits")
    .select("id, provider_reference")
    .eq("provider", "busha")
    .eq("status", "pending")
    .lt("created_at", staleCutoff)
    .not("provider_reference", "is", null);

  console.log("[reconcile-deposits] run started", { staleDepositCount: staleDeposits?.length ?? 0 });

  const results: { depositId: string; outcome: string }[] = [];

  for (const deposit of staleDeposits ?? []) {
    if (!deposit.provider_reference) continue;
    try {
      const transfer = await getTransfer(deposit.provider_reference);
      if (transfer.status === "funds_received") {
        const { error } = await admin.rpc("credit_deposit", { p_deposit_id: deposit.id });
        if (error) {
          console.error("[reconcile-deposits] credit_deposit RPC failed", { deposit, error });
          results.push({ depositId: deposit.id, outcome: `credit failed: ${error.message}` });
        } else {
          console.log("[reconcile-deposits] credited a stale deposit the webhook missed", {
            depositId: deposit.id,
            providerReference: deposit.provider_reference,
          });
          results.push({ depositId: deposit.id, outcome: "credited" });
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const { error } = await admin.rpc("fail_deposit", { p_deposit_id: deposit.id });
        if (error) {
          console.error("[reconcile-deposits] fail_deposit RPC failed", { deposit, error });
        }
        results.push({ depositId: deposit.id, outcome: `marked failed (${transfer.status})` });
      } else {
        results.push({ depositId: deposit.id, outcome: `still ${transfer.status}` });
      }
    } catch (err) {
      console.error("[reconcile-deposits] Busha lookup failed", { deposit, err });
      results.push({ depositId: deposit.id, outcome: err instanceof Error ? err.message : "check failed" });
    }
  }

  console.log("[reconcile-deposits] run finished", { checked: results.length, results });
  return NextResponse.json({ checked: results.length, results });
}
