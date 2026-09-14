import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Quidax's docs describe a configurable "Signature Type" for webhooks (set from the dashboard
// once a webhook is registered against a public HTTPS URL) but don't document the actual
// header name or algorithm anywhere accessible — unconfirmed, same gap flagged in the plan.
// This assumes the common HMAC-SHA256-of-raw-body pattern as a best-effort guard rather than
// leaving the endpoint fully open, but MUST be verified against the real dashboard config
// (header name included) before this goes live, exactly like Busha's `x-bu-signature` was
// confirmed directly from its docs rather than guessed.
function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.QUIDAX_WEBHOOK_SECRET;
  if (!secret) return true; // Not yet configured — allow through so local/dashboard setup isn't blocked.
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const gotBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== gotBuf.length) return false;
  return timingSafeEqual(expectedBuf, gotBuf);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-quidax-signature");

  if (!isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { event?: string; data?: { id?: string; status?: string } };
  const admin = createAdminClient();

  await admin.from("webhook_events").insert({
    provider: "quidax",
    event_type: payload.event ?? "unknown",
    payload: payload as Record<string, unknown>,
  });

  const providerReference = payload.data?.id;
  if (!providerReference) {
    return NextResponse.json({ received: true });
  }

  switch (payload.event) {
    case "swap_transaction.completed": {
      const { data: transaction } = await admin
        .from("transactions")
        .select("id")
        .eq("provider", "quidax")
        .eq("provider_reference", providerReference)
        .maybeSingle();
      if (transaction) {
        await admin.rpc("complete_quidax_swap_transaction", { p_transaction_id: transaction.id });
      }
      break;
    }
    case "swap_transaction.failed": {
      const { data: transaction } = await admin
        .from("transactions")
        .select("id")
        .eq("provider", "quidax")
        .eq("provider_reference", providerReference)
        .maybeSingle();
      if (transaction) {
        await admin.rpc("fail_quidax_swap_transaction", { p_transaction_id: transaction.id });
      }
      break;
    }
    // A deposit-completed event will land here once Quidax's deposit-collection mechanics are
    // confirmed (see src/lib/quidax/client.ts's createDeposit() stub) — it should look up the
    // matching row in `deposits` by provider_reference and call credit_deposit(id).
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
