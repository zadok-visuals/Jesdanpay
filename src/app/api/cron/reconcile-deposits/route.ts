import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";

// Fallback safety net for the "deposits not reflecting" bug — independent of whether the
// webhook itself is healthy. Runs on a schedule (see vercel.json) and polls Busha's own API
// directly for any deposit that's been sitting pending for a while, in case its webhook
// delivery was ever lost, rejected, or simply never sent. Scoped to Busha only for now — GHS/
// Klasha deposits are blocked account-wide anyway (see src/lib/klasha/client.ts), so there's
// nothing to reconcile there yet.
const STALE_AFTER_MINUTES = 15;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

  const results: { depositId: string; outcome: string }[] = [];

  for (const deposit of staleDeposits ?? []) {
    if (!deposit.provider_reference) continue;
    try {
      const transfer = await getTransfer(deposit.provider_reference);
      if (transfer.status === "funds_received") {
        await admin.rpc("credit_deposit", { p_deposit_id: deposit.id });
        results.push({ depositId: deposit.id, outcome: "credited" });
      } else {
        results.push({ depositId: deposit.id, outcome: `still ${transfer.status}` });
      }
    } catch (err) {
      results.push({ depositId: deposit.id, outcome: err instanceof Error ? err.message : "check failed" });
    }
  }

  return NextResponse.json({ checked: results.length, results });
}
