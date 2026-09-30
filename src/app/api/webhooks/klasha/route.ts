import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBody } from "@/lib/klasha/client";

// SECURITY (forgery hardening): nothing here verifies a request actually came from Klasha —
// anyone who knew (or could guess/leak) a tnxRef could POST a forged `charge.completed` /
// status: "successful" event and get a deposit credited with nothing actually paid. Unlike the
// Busha webhook (src/app/api/webhooks/busha/route.ts), Klasha's client
// (src/lib/klasha/client.ts) has no independent "check the real status" endpoint implemented yet
// to re-verify against — only createCollection exists — so the payload's reported status can't
// be re-confirmed the same way. As a minimum mitigation, verifyKlashaSignature below checks a
// shared secret against a few plausible header names; see that function's own comment for why
// this stays a warning, not a hard rejection, for now. KNOWN OPEN GAP: revisit once a real
// status-check endpoint can be added to client.ts — the auth rebuild there (login()/JWT caching)
// now makes that practical to build.
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

// KLASHA_WEBHOOK_SECRET (the value entered in Klasha's dashboard "Enter your webhook key" field)
// checked against a short list of plausible header names, since the real one has never been
// confirmed by a real delivery or by Klasha's docs/support — same log-first-then-tighten
// discipline as the Busha webhook route: a mismatch (or no candidate header present at all) is
// logged with every header captured, never rejected, so a wrong guess here can't silently break
// real webhook delivery the way a guessed header name already did once for Busha (see that
// route's own header comment for the full story). Revisit once a real delivery or Klasha support
// confirms the actual header name/scheme.
const KLASHA_SIGNATURE_HEADER_CANDIDATES = ["x-klasha-signature", "x-webhook-key", "webhook-key"];

function verifyKlashaSignature(headers: Record<string, string>): boolean | null {
  const secret = process.env.KLASHA_WEBHOOK_SECRET;
  if (!secret) return null; // check disabled — no secret configured

  const secretBuf = Buffer.from(secret);
  return KLASHA_SIGNATURE_HEADER_CANDIDATES.some((headerName) => {
    const value = headers[headerName];
    if (!value) return false;
    const valueBuf = Buffer.from(value);
    return valueBuf.length === secretBuf.length && timingSafeEqual(valueBuf, secretBuf);
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const admin = createAdminClient();
  const debugHeaders = Object.fromEntries(request.headers.entries());

  const signatureValid = verifyKlashaSignature(debugHeaders);
  if (signatureValid === false) {
    console.warn(
      "[klasha webhook] none of the plausible webhook-secret headers matched KLASHA_WEBHOOK_SECRET — NOT rejecting (see this file's signature-check comment), just flagging for review",
      { debugHeaders },
    );
  }

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
    payload: {
      ...payload,
      _debugHeaders: debugHeaders,
      _debugRawBody: rawBody,
      _debugSignatureValid: signatureValid,
    } as Record<string, unknown>,
  });

  if (payload.event === "charge.completed" && payload.data?.tnxRef && payload.data.status === "successful") {
    const { data: deposit } = await admin
      .from("deposits")
      .select("id")
      .eq("provider", "klasha")
      .eq("provider_reference", payload.data.tnxRef)
      .maybeSingle();
    if (deposit) {
      // Klasha (bank-transfer deposits) has no equivalent "re-check the real confirmed amount"
      // step — null falls back to the originally requested amount, same as before migration 0028.
      await admin.rpc("credit_deposit", { p_deposit_id: deposit.id, p_actual_amount: null });
    }
  }

  return NextResponse.json({ received: true });
}
