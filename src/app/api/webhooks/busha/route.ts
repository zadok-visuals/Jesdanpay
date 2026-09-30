import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";

// SECURITY (forgery hardening): this route used to trust the incoming POST body's own `status`
// field to decide whether to complete or fail a `transactions` row. Since nothing verified the
// request actually came from Busha, anyone who knew (or could guess/leak) a provider_reference
// could POST a forged `funds_converted`/`funds_delivered` event and get a wallet credited with
// nothing actually paid. Fixed below by re-fetching the transfer from Busha's own API
// (getTransfer) and acting only on the status THAT call reports — see the SECURITY comment
// further down for the exact mechanism. A signature check (verifyBushaSignature) was also added
// as defense in depth, kept non-blocking per the header comment on that function.
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
//
// Signature check: `x-bu-signature` is CONFIRMED (not guessed) as the real header Busha sends —
// reverse-engineered directly against 8 real captured deliveries (both deposit and withdrawal
// events) in `webhook_events._debugHeaders`/`_debugRawBody`, all matching
// base64(HMAC-SHA256(BUSHA_WEBHOOK_SECRET, rawBody)). That's strong evidence, but it's this
// codebase's own reverse-engineering, not something lifted from Busha's published docs or
// confirmed by their support — so, keeping the exact discipline this file's own header comment
// above describes for the last header-name mistake, a mismatch is only logged (see the
// `signatureValid === false` check below), never rejected. Start returning 401 on a mismatch
// once that's independently confirmed, or once enough real traffic has passed through without a
// single logged mismatch.
function verifyBushaSignature(rawBody: string, signatureHeader: string | null): boolean | null {
  const secret = process.env.BUSHA_WEBHOOK_SECRET;
  if (!secret) return null; // check disabled — no secret configured
  if (!signatureHeader) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
  const actual = Buffer.from(signatureHeader);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const debugHeaders = Object.fromEntries(request.headers.entries());
  const admin = createAdminClient();

  const signatureValid = verifyBushaSignature(rawBody, request.headers.get("x-bu-signature"));
  if (signatureValid === false) {
    console.warn(
      "[busha webhook] x-bu-signature did not match BUSHA_WEBHOOK_SECRET — NOT rejecting (see this file's signature-check comment), just flagging for review",
      { debugHeaders },
    );
  }

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
      payload: {
        ...payload,
        _debugHeaders: debugHeaders,
        _debugRawBody: rawBody,
        _debugSignatureValid: signatureValid,
      } as Record<string, unknown>,
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
      // The webhook payload's own amount fields (if any) aren't confirmed against real Busha
      // docs — never trust them blindly. Re-fetch the transfer directly and credit whatever it
      // reports as actually confirmed on-chain (see migration 0028's header comment for why this
      // can differ from the amount originally requested).
      let actualAmount: number | null = null;
      try {
        const transfer = await getTransfer(providerReference);
        actualAmount = Number(transfer.target_amount);
      } catch (err) {
        console.error("[busha webhook] could not re-fetch transfer for actual amount", {
          eventId: eventRow?.id,
          providerReference,
          error: err instanceof Error ? err.message : err,
        });
      }
      const { error } = await admin.rpc("credit_deposit", {
        p_deposit_id: deposit.id,
        p_actual_amount: actualAmount,
      });
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
  } else if (
    status === "funds_converted" ||
    status === "funds_delivered" ||
    (status === "funds_not_delivered" && category !== "deposit") ||
    (status === "cancelled" && category !== "deposit")
  ) {
    // SECURITY (forgery hardening — see top-of-file comment): this branch used to trust the
    // payload's own `status` directly, so a forged POST claiming `funds_converted` for a
    // provider_reference the sender doesn't control (guessed or leaked) could complete a
    // transaction and credit a wallet with nothing actually paid. Fix: the payload is now only a
    // "something may have happened, go check" trigger — once the matching transaction is found,
    // re-fetch it from Busha's own API (getTransfer) and act ONLY on the status THAT call
    // reports, exactly like src/app/api/cron/reconcile-busha-transfers/route.ts's stale-
    // transaction safety net already does. A forged payload can still reach this handler, but it
    // can no longer move money unless Busha's own API independently confirms the outcome.
    const { data: transaction } = await admin
      .from("transactions")
      .select("id, type")
      .eq("provider", "busha")
      .eq("provider_reference", providerReference)
      .maybeSingle();

    if (!transaction) {
      console.error("[busha webhook] payload suggested a terminal status but no matching transaction found", {
        eventId: eventRow?.id,
        providerReference,
        payloadStatus: status,
      });
    } else {
      const isWithdrawal = transaction.type === "withdrawal";
      const completeRpc = isWithdrawal ? "complete_withdrawal_payout" : "complete_busha_swap_transaction";
      const failRpc = isWithdrawal ? "fail_withdrawal_payout" : "fail_busha_swap_transaction";

      try {
        const transfer = await getTransfer(providerReference);
        if (transfer.status === "funds_converted" || transfer.status === "funds_delivered") {
          const { error } = await admin.rpc(completeRpc, { p_transaction_id: transaction.id });
          if (error) {
            console.error(`[busha webhook] ${completeRpc} RPC failed`, {
              eventId: eventRow?.id,
              transactionId: transaction.id,
              providerReference,
              error,
            });
          }
        } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
          const { error } = await admin.rpc(failRpc, { p_transaction_id: transaction.id });
          if (error) {
            console.error(`[busha webhook] ${failRpc} RPC failed`, {
              eventId: eventRow?.id,
              transactionId: transaction.id,
              providerReference,
              error,
            });
          }
        } else {
          console.log(
            "[busha webhook] payload claimed a terminal status but Busha's own API still reports it in progress — ignoring the payload, taking no action",
            { eventId: eventRow?.id, transactionId: transaction.id, providerReference, payloadStatus: status, actualStatus: transfer.status },
          );
        }
      } catch (err) {
        console.error("[busha webhook] could not verify transfer status via getTransfer — ignoring the payload's own status entirely", {
          eventId: eventRow?.id,
          transactionId: transaction.id,
          providerReference,
          payloadStatus: status,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  } else if (status === "funds_not_delivered" || status === "cancelled") {
    // category === "deposit" only — the non-deposit case is handled above via getTransfer
    // re-verification. Deposits have no equivalent "was it really delivered" re-check endpoint
    // (see credit_deposit's own use of getTransfer above, which re-checks the AMOUNT, not
    // whether it happened at all) — out of scope for this pass, tracked as a known gap.
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
  }

  await markProcessed();
  return NextResponse.json({ received: true });
}
