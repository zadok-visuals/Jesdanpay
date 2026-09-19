import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Busha's exact webhook signature scheme is unconfirmed — one search result surfaced an
// X-BC-Signature HMAC-SHA256 header, but that source pointed at developers.commerce.busha.co
// ("Busha Commerce"), a different product from the docs.busha.io API this app integrates
// against. Rather than implement an unverified algorithm, this checks a plain shared-secret
// header (set BUSHA_WEBHOOK_SECRET to whatever value you configure in the Busha dashboard) —
// replace with real signature verification once confirmed against a live account.
function isAuthorized(secretHeader: string | null): boolean {
  const secret = process.env.BUSHA_WEBHOOK_SECRET;
  if (!secret) return true; // Not yet configured — allow through so local/dashboard setup isn't blocked.
  if (!secretHeader) return false;

  const expected = Buffer.from(secret, "utf8");
  const got = Buffer.from(secretHeader, "utf8");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

// Busha's exact webhook payload shape (event name, wrapping) isn't confirmed either — this
// reads directly off the transfer object's own fields (id, status, category), which are
// confirmed from the Create Transfer API reference, rather than assuming an event-name schema.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const secretHeader = request.headers.get("x-busha-webhook-secret");

  if (!isAuthorized(secretHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    data?: { id?: string; status?: string; category?: string };
  };
  const admin = createAdminClient();

  await admin.from("webhook_events").insert({
    provider: "busha",
    event_type: payload.data?.category ?? "unknown",
    payload: payload as Record<string, unknown>,
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
