import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBody } from "@/lib/klasha/client";

// Klasha's payment API encrypts request bodies (3DES-CBC, confirmed from their own docs); it's
// a reasonable assumption webhook payloads follow the same convention, but this is unconfirmed
// until a real webhook fires against a live account. Only deposit collection lands here —
// Klasha's CNY payout was removed (merchant-only product per their own team, not something
// resellable to end customers via API).
//
// TEMPORARY: the Klasha dashboard has an "Enter your webhook key" field with no public
// documentation for what it does — no confirmed header name or algorithm anywhere. Rather than
// guess a verification scheme, every header is logged alongside the payload below so the first
// real webhook that fires reveals the actual mechanism (e.g. a signature header we can then
// verify against the key entered in that dashboard field). Remove `_debugHeaders` from the
// logged payload once the real scheme is confirmed and implemented properly.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const admin = createAdminClient();
  const debugHeaders = Object.fromEntries(request.headers.entries());

  let payload: {
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
    event_type: payload.event ?? "unknown",
    payload: { ...payload, _debugHeaders: debugHeaders, _debugRawBody: rawBody } as Record<string, unknown>,
  });

  if (payload.event === "charge.completed" && payload.data?.tnxRef && payload.data.status === "successful") {
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
