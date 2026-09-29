import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBody } from "@/lib/klasha/client";
import { checkWebhookSecret } from "@/lib/webhook-auth";

// SECURITY (webhook forgery hardening): this route credits a deposit based solely on the
// `status` field inside the POST body, with nothing verifying the request actually came from
// Klasha — so a forged POST naming a real `tnxRef` could get a wallet credited with nothing
// actually paid. Unlike the Busha webhook, there is no independent status-check endpoint here
// yet (src/lib/klasha/client.ts only implements createCollection), so the payload's claimed
// status can't be re-verified against Klasha's own API the same way. As a minimum mitigation, an
// optional check against KLASHA_WEBHOOK_KEY (the value entered into the Klasha dashboard's
// webhook config) is added below — non-blocking (log-only on a mismatch) until a confirmed real
// delivery reveals the actual header Klasha uses, same log-first-then-tighten discipline as the
// header-guessing history described below. This is a known open gap: revisit once Klasha
// account access clears and a status-check endpoint can be
// added to src/lib/klasha/client.ts, at which point this route should re-verify the same way
// src/app/api/webhooks/busha/route.ts now does.
//
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

  const { data: eventRow } = await admin
    .from("webhook_events")
    .insert({
      provider: "klasha",
      event_type: payload.event ?? "unknown",
      payload: { ...payload, _debugHeaders: debugHeaders, _debugRawBody: rawBody } as Record<string, unknown>,
    })
    .select("id")
    .single();

  // Optional shared-secret check. Non-blocking on purpose — see the top-of-file comment: a
  // guessed-wrong header name has already silently broken real webhook delivery here once
  // (Busha's equivalent), so until a confirmed real delivery shows the actual header Klasha
  // sends a secret in, a mismatch only logs a warning rather than rejecting the request.
  const klashaWebhookKey = process.env.KLASHA_WEBHOOK_KEY;
  if (klashaWebhookKey) {
    const { matched, matchedHeader } = checkWebhookSecret(
      debugHeaders,
      ["x-klasha-signature", "x-webhook-key", "webhook-key"],
      klashaWebhookKey,
    );
    if (matched) {
      console.log("[klasha webhook] shared-secret header verified", { eventId: eventRow?.id, matchedHeader });
    } else {
      console.warn(
        "[klasha webhook] KLASHA_WEBHOOK_KEY is set but no header matched any candidate name — processing anyway; check _debugHeaders on this event once confirmed real to find the actual header Klasha uses",
        { eventId: eventRow?.id, debugHeaders },
      );
    }
  }

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
