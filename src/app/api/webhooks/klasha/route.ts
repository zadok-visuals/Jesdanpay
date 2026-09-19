import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBody } from "@/lib/klasha/client";

// Klasha's payment API encrypts request bodies (3DES-CBC, confirmed from their own docs); it's
// a reasonable assumption webhook payloads follow the same convention, but this is unconfirmed
// until a real webhook fires against a live sandbox account. Two event shapes land here:
//   - CNY payout status: { requestId, payoutStatus, amount }
//   - Deposit collection: { event: "charge.completed", data: { tnxRef, status, ... } } —
//     confirmed field names from Klasha's webhook docs.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const admin = createAdminClient();

  let payload: {
    requestId?: string;
    id?: number;
    payoutStatus?: string;
    amount?: number;
    event?: string;
    data?: { tnxRef?: string; status?: string; destinationAmount?: number };
  };
  try {
    const { message } = JSON.parse(rawBody) as { message?: string };
    payload = message ? (decryptBody(message) as typeof payload) : JSON.parse(rawBody);
  } catch {
    payload = JSON.parse(rawBody);
  }

  await admin.from("webhook_events").insert({
    provider: "klasha",
    event_type: payload.event ?? payload.payoutStatus ?? "unknown",
    payload: payload as Record<string, unknown>,
  });

  // Deposit collection event.
  if (payload.event === "charge.completed" && payload.data?.tnxRef) {
    if (payload.data.status === "successful") {
      const { data: deposit } = await admin
        .from("deposits")
        .select("id")
        .eq("provider", "klasha")
        .eq("provider_reference", payload.data.tnxRef)
        .maybeSingle();
      if (deposit) {
        await admin.rpc("credit_deposit", { p_deposit_id: deposit.id });
      }
    }
    return NextResponse.json({ received: true });
  }

  // CNY payout status event.
  const providerReference = payload.requestId ?? String(payload.id ?? "");
  if (!providerReference || !payload.payoutStatus) {
    return NextResponse.json({ received: true });
  }

  const { data: transaction } = await admin
    .from("transactions")
    .select("id")
    .eq("provider", "klasha")
    .eq("provider_reference", providerReference)
    .maybeSingle();

  if (transaction) {
    if (payload.payoutStatus === "SUCCESSFUL") {
      await admin.rpc("complete_klasha_rmb_transaction", {
        p_transaction_id: transaction.id,
        p_actual_target_amount: payload.amount ?? 0,
      });
    } else if (payload.payoutStatus === "FAILED") {
      await admin.rpc("fail_klasha_rmb_transaction", { p_transaction_id: transaction.id });
    }
  }

  return NextResponse.json({ received: true });
}
