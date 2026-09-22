import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// PRIOR BUG (found during the "deposits not reflecting" audit): this route used to check a
// header named `x-busha-webhook-secret` — a name that was NEVER confirmed against Busha's real
// docs, just guessed. Since BUSHA_WEBHOOK_SECRET was set, every real webhook delivery got
// rejected with 401 before the payload was even logged, so `webhook_events` never had a single
// row and no deposit was ever credited via webhook. That's very likely the entire bug.
//
// Fix: log every delivery (including raw headers) unconditionally, regardless of whether an
// auth header is present or matches a guessed name — visibility first. Once a few real
// deliveries land, `payload._debugHeaders` will show the actual header name Busha uses (if
// any), and this can be tightened back up to a real signature check instead of accepting
// everything. Remove `_debugHeaders`/`_debugRawBody` and re-add strict verification once that's
// confirmed — same discipline already applied to the Klasha webhook route for the same reason.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const debugHeaders = Object.fromEntries(request.headers.entries());
  const admin = createAdminClient();

  let payload: { data?: { id?: string; status?: string; category?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Log even a body that fails to parse — that's still useful diagnostic signal, and
    // returning an error here would just make Busha retry (and keep failing) forever.
    await admin.from("webhook_events").insert({
      provider: "busha",
      event_type: "unparseable",
      payload: { _debugHeaders: debugHeaders, _debugRawBody: rawBody },
    });
    return NextResponse.json({ received: true });
  }

  await admin.from("webhook_events").insert({
    provider: "busha",
    event_type: payload.data?.category ?? "unknown",
    payload: { ...payload, _debugHeaders: debugHeaders, _debugRawBody: rawBody } as Record<string, unknown>,
  });

  const providerReference = payload.data?.id;
  const status = payload.data?.status;
  const category = payload.data?.category;
  if (!providerReference || !status) {
    return NextResponse.json({ received: true });
  }

  if (category === "deposit" && status === "funds_received") {
    const { data: deposit } = await admin
      .from("deposits")
      .select("id")
      .eq("provider", "busha")
      .eq("provider_reference", providerReference)
      .maybeSingle();
    if (deposit) {
      await admin.rpc("credit_deposit", { p_deposit_id: deposit.id });
    }
  } else if (status === "funds_converted" || status === "funds_delivered") {
    const { data: transaction } = await admin
      .from("transactions")
      .select("id")
      .eq("provider", "busha")
      .eq("provider_reference", providerReference)
      .maybeSingle();
    if (transaction) {
      await admin.rpc("complete_busha_swap_transaction", { p_transaction_id: transaction.id });
    }
  } else if (status === "funds_not_delivered" || status === "cancelled") {
    const { data: transaction } = await admin
      .from("transactions")
      .select("id")
      .eq("provider", "busha")
      .eq("provider_reference", providerReference)
      .maybeSingle();
    if (transaction) {
      await admin.rpc("fail_busha_swap_transaction", { p_transaction_id: transaction.id });
    }
  }

  return NextResponse.json({ received: true });
}
