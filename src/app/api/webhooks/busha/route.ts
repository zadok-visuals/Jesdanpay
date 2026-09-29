import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";
import { checkWebhookSecret } from "@/lib/webhook-auth";

// SECURITY (webhook forgery hardening): this route used to complete or fail a `transactions`
// row based solely on the `status` field inside the POST body. Since nothing verified the
// request came from Busha, anyone who could guess (or observe) a real `provider_reference` could
// POST a forged `funds_converted`/`funds_delivered` event here and get a wallet credited with
// nothing actually paid. The swap-completing/failing branches below now re-verify the real
// status via `getTransfer` (Busha's own API) before acting — same pattern already used by
// src/app/api/cron/reconcile-deposits/route.ts — and an optional BUSHA_WEBHOOK_SECRET header
// check is layered on top, non-blocking until a confirmed real delivery reveals which header
// Busha actually sends it in (see that check below, and the header-guessing history right here).
//
// PRIOR BUG (found during the "deposits not reflecting" audit): this route used to check a
// header named `x-busha-webhook-secret` — a name that was NEVER confirmed against Busha's real
// docs, just guessed. Since BUSHA_WEBHOOK_SECRET was set, every real webhook delivery got
// rejected with 401 before the payload was even logged, so `webhook_events` never had a single
// row and no deposit was ever credited via webhook. That fix shipped in commit 4e9bfa6 — but
// every deploy from that commit through 1db0495 silently FAILED on Vercel (an unrelated
// vercel.json cron config was invalid for the Hobby plan), so the fix never actually went live
// until 5e55c37 removed it. As of that deploy, `webhook_events` was still empty: Busha has never
// once successfully called this URL. That points at the webhook not being registered/enabled on
// Busha's dashboard at all, not at anything in this handler — verify the registered URL there.
//
// Fix: log every delivery (including raw headers) unconditionally, regardless of whether an
// auth header is present or matches a guessed name — visibility first. Once a few real
// deliveries land, `payload._debugHeaders` will show the actual header name Busha uses (if
// any), and this can be tightened back up to a real signature check instead of accepting
// everything. Remove `_debugHeaders`/`_debugRawBody` and re-add strict verification once that's
// confirmed — same discipline already applied to the Klasha webhook route for the same reason.
//
// Every branch below logs to the server console (visible in Vercel's function logs) in addition
// to webhook_events, and every processed event now stamps `processed_at` — so "did this fire,
// and what happened" is answerable from logs alone instead of only being discovered when a user
// reports a missing deposit.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const debugHeaders = Object.fromEntries(request.headers.entries());
  const admin = createAdminClient();

  let payload: { data?: { id?: string; status?: string; category?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[busha webhook] received an unparseable body", { rawBody, debugHeaders });
    // Log even a body that fails to parse — that's still useful diagnostic signal, and
    // returning an error here would just make Busha retry (and keep failing) forever.
    await admin.from("webhook_events").insert({
      provider: "busha",
      event_type: "unparseable",
      payload: { _debugHeaders: debugHeaders, _debugRawBody: rawBody },
      processed_at: new Date().toISOString(),
    });
    return NextResponse.json({ received: true });
  }

  const { data: eventRow } = await admin
    .from("webhook_events")
    .insert({
      provider: "busha",
      event_type: payload.data?.category ?? "unknown",
      payload: { ...payload, _debugHeaders: debugHeaders, _debugRawBody: rawBody } as Record<string, unknown>,
    })
    .select("id")
    .single();

  console.log("[busha webhook] received", {
    eventId: eventRow?.id,
    category: payload.data?.category,
    status: payload.data?.status,
    providerReference: payload.data?.id,
  });

  const providerReference = payload.data?.id;
  const status = payload.data?.status;
  const category = payload.data?.category;

  // Optional shared-secret check. Non-blocking on purpose: the last time a header name here was
  // guessed instead of confirmed (x-busha-webhook-secret), every real delivery got rejected
  // before it was ever logged, and nobody noticed for weeks. So until a confirmed real delivery
  // shows _debugHeaders carrying the actual header Busha uses, a mismatch only logs a warning —
  // it never blocks processing.
  const bushaWebhookSecret = process.env.BUSHA_WEBHOOK_SECRET;
  if (bushaWebhookSecret) {
    const { matched, matchedHeader } = checkWebhookSecret(
      debugHeaders,
      ["x-busha-signature", "x-webhook-secret", "x-busha-webhook-secret", "busha-signature"],
      bushaWebhookSecret,
    );
    if (matched) {
      console.log("[busha webhook] shared-secret header verified", { eventId: eventRow?.id, matchedHeader });
    } else {
      console.warn(
        "[busha webhook] BUSHA_WEBHOOK_SECRET is set but no header matched any candidate name — processing anyway; check _debugHeaders on this event once confirmed real to find the actual header Busha uses",
        { eventId: eventRow?.id, debugHeaders },
      );
    }
  }

  // Don't trust the webhook payload's own `status` for anything that completes or fails a
  // transaction — a forged POST naming a real provider_reference could otherwise get a swap
  // completed (money credited) for nothing actually converted. Re-verify against Busha's own API
  // and act only on what IT reports, exactly like reconcile-deposits does for stale deposits.
  async function verifyAndFinalizeBushaSwap(transactionId: string, reference: string) {
    let transfer;
    try {
      transfer = await getTransfer(reference);
    } catch (err) {
      console.error(
        "[busha webhook] getTransfer failed while verifying swap status — leaving transaction untouched",
        { eventId: eventRow?.id, transactionId, providerReference: reference, err },
      );
      return;
    }

    if (transfer.status === "funds_converted" || transfer.status === "funds_delivered") {
      const { error } = await admin.rpc("complete_busha_swap_transaction", { p_transaction_id: transactionId });
      if (error) {
        console.error("[busha webhook] complete_busha_swap_transaction RPC failed", {
          eventId: eventRow?.id,
          transactionId,
          providerReference: reference,
          error,
        });
      }
    } else if (transfer.status === "funds_not_delivered" || transfer.status === "cancelled") {
      const { error } = await admin.rpc("fail_busha_swap_transaction", { p_transaction_id: transactionId });
      if (error) {
        console.error("[busha webhook] fail_busha_swap_transaction RPC failed", {
          eventId: eventRow?.id,
          transactionId,
          providerReference: reference,
          error,
        });
      }
    } else {
      console.log(
        "[busha webhook] payload claimed a terminal status but Busha's own API still reports a non-terminal one — not acting yet",
        { eventId: eventRow?.id, transactionId, providerReference: reference, claimedStatus: status, actualStatus: transfer.status },
      );
    }
  }

  async function markProcessed() {
    if (eventRow?.id) {
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", eventRow.id);
    }
  }

  if (!providerReference || !status) {
    console.warn("[busha webhook] missing id/status on payload — nothing to act on", {
      eventId: eventRow?.id,
      payload,
    });
    await markProcessed();
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
      const { error } = await admin.rpc("credit_deposit", { p_deposit_id: deposit.id });
      if (error) {
        console.error("[busha webhook] credit_deposit RPC failed", {
          eventId: eventRow?.id,
          depositId: deposit.id,
          providerReference,
          error,
        });
      } else {
        console.log("[busha webhook] credited deposit", { depositId: deposit.id, providerReference });
      }
    } else {
      console.error("[busha webhook] funds_received but no matching deposit row found", {
        eventId: eventRow?.id,
        providerReference,
      });
    }
  } else if (status === "funds_converted" || status === "funds_delivered") {
    const { data: transaction } = await admin
      .from("transactions")
      .select("id")
      .eq("provider", "busha")
      .eq("provider_reference", providerReference)
      .maybeSingle();
    if (transaction) {
      await verifyAndFinalizeBushaSwap(transaction.id, providerReference);
    } else {
      console.error("[busha webhook] funds_converted/delivered but no matching transaction found", {
        eventId: eventRow?.id,
        providerReference,
      });
    }
  } else if (status === "funds_not_delivered" || status === "cancelled") {
    if (category === "deposit") {
      const { data: deposit } = await admin
        .from("deposits")
        .select("id")
        .eq("provider", "busha")
        .eq("provider_reference", providerReference)
        .maybeSingle();
      if (deposit) {
        const { error } = await admin.rpc("fail_deposit", { p_deposit_id: deposit.id });
        if (error) {
          console.error("[busha webhook] fail_deposit RPC failed", {
            eventId: eventRow?.id,
            depositId: deposit.id,
            providerReference,
            error,
          });
        }
      }
    } else {
      const { data: transaction } = await admin
        .from("transactions")
        .select("id")
        .eq("provider", "busha")
        .eq("provider_reference", providerReference)
        .maybeSingle();
      if (transaction) {
        await verifyAndFinalizeBushaSwap(transaction.id, providerReference);
      }
    }
  }

  await markProcessed();
  return NextResponse.json({ received: true });
}
