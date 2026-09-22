"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import { applyMarkup } from "@/lib/busha/markup";
import { toCustomerError } from "@/lib/provider-error";

export interface ExecuteSwapState {
  error?: string;
  transactionId?: string;
}

// A single atomic action replacing the old two-step "Get quote" (creates a real, separately
// reviewable Busha quote with its own id/expiry) then "Confirm & Exchange" (executes that exact
// quote by id). The UI now shows a live *estimate* the whole time (via previewLiveBushaRate +
// client-side math, no real quote object involved) — so by the time the user actually commits,
// there's no separate quote sitting around to expire or go stale; this creates a real quote for
// the *current* typed amount and executes it in the same call. Busha's own transfer-response
// amounts are still what get credited — never the client's estimate — matching the same
// never-trust-client-echoed-amounts discipline the old two-step version already had.
export async function executeSwap(
  _prevState: ExecuteSwapState,
  formData: FormData,
): Promise<ExecuteSwapState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sourceCurrency = String(formData.get("sourceCurrency") ?? "") as Currency;
  const targetCurrency = String(formData.get("targetCurrency") ?? "") as Currency;
  const amount = String(formData.get("amount") ?? "");

  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  let transfer;
  try {
    const quote = await busha.createQuote({ sourceCurrency, targetCurrency, sourceAmount: amount });
    transfer = await busha.createTransfer(quote.id);
  } catch (err) {
    return { error: toCustomerError(err, "busha.executeSwap") };
  }

  const txSourceCurrency = transfer.source_currency.toUpperCase() as Currency;
  const txTargetCurrency = transfer.target_currency.toUpperCase() as Currency;
  const txSourceAmount = Number(transfer.source_amount);
  const effectiveTargetAmount = applyMarkup(Number(transfer.target_amount));

  const { data: transactionId, error: rpcError } = await supabase.rpc("create_busha_swap_transaction", {
    p_source_currency: txSourceCurrency,
    p_target_currency: txTargetCurrency,
    p_source_amount: txSourceAmount,
    p_target_amount: Number(effectiveTargetAmount.toFixed(2)),
    p_provider_reference: transfer.id,
  });

  if (rpcError) return { error: rpcError.message };

  // Best-effort synchronous completion — Busha's transfer status values for a same-account
  // conversion aren't fully confirmed (docs enumerate several terminal states across deposit/
  // withdrawal/conversion categories). Complete immediately only on an unambiguous success
  // status; otherwise leave it pending for the webhook. complete_busha_swap_transaction is
  // idempotent, so a later webhook call is always safe either way.
  if (
    (transfer.status === "funds_converted" || transfer.status === "funds_delivered") &&
    transactionId
  ) {
    const admin = createAdminClient();
    await admin.rpc("complete_busha_swap_transaction", { p_transaction_id: transactionId });
  }

  return { transactionId: transactionId ?? undefined };
}

export interface DepositQuoteState {
  error?: string;
  quoteId?: string;
  fee?: string;
  amount?: string;
  currency?: Currency;
}

// Real pricing preview against Busha's confirmed /v1/quotes endpoint (same-currency quote).
export async function getDepositQuote(
  _prevState: DepositQuoteState,
  formData: FormData,
): Promise<DepositQuoteState> {
  const currency = String(formData.get("currency") ?? "").toUpperCase() as Currency;
  const amount = String(formData.get("amount") ?? "");

  // NGN moved here from Klasha — confirmed live and working on Busha, while Klasha's
  // NGN/GHS deposit access has been blocked account-wide since it was built. GHS stays on
  // Klasha since Busha's real account rejects it outright ("Invalid Currency GHS").
  if (currency !== "NGN" && currency !== "KES" && currency !== "USDT") {
    return { error: "Deposits are only available in NGN, KES, or USDT." };
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  try {
    const quote = await busha.createQuote({
      sourceCurrency: currency,
      targetCurrency: currency,
      sourceAmount: amount,
      isDeposit: true,
    });
    const fee = quote.fees.reduce((sum, f) => sum + Number(f.amount.amount), 0);
    return { quoteId: quote.id, fee: fee.toFixed(2), amount, currency };
  } catch (err) {
    return { error: toCustomerError(err, "busha.getDepositQuote") };
  }
}

export interface DepositActionState {
  error?: string;
  depositId?: string;
  bankDetails?: { accountName: string; accountNumber: string; bankName: string; expiresAt: string };
  cryptoAddress?: { address: string; network: string; expiresAt: string };
}

// Executes the deposit quote, recording a pending `deposits` row (service-role insert — no
// insert policy exists for regular users) and returning whatever payment instructions Busha
// generated so the UI can display them. The webhook credits the wallet once Busha confirms
// funds received.
export async function initiateDeposit(
  _prevState: DepositActionState,
  formData: FormData,
): Promise<DepositActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const quoteId = String(formData.get("quoteId") ?? "");
  const currency = String(formData.get("currency") ?? "").toUpperCase() as Currency;
  if (!quoteId) return { error: "Missing quote." };

  let transfer;
  try {
    transfer = await busha.createTransfer(quoteId);
  } catch (err) {
    return { error: toCustomerError(err, "busha.initiateDeposit") };
  }

  const admin = createAdminClient();
  // Credit the wallet for Busha's own confirmed `target_amount` (net of their gateway fee),
  // not the gross amount the client asked to deposit — confirmed live that a ₦2,000 deposit
  // quote returns `target_amount: "1900"` after a ₦100 fee, so crediting the raw requested
  // amount would over-credit the user by the fee every time.
  const { data: deposit, error: insertError } = await admin
    .from("deposits")
    .insert({
      user_id: user.id,
      currency,
      amount: Number(transfer.target_amount),
      provider: "busha",
      provider_reference: transfer.id,
    })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };

  if (transfer.pay_in.address) {
    return {
      depositId: deposit.id,
      cryptoAddress: {
        address: transfer.pay_in.address,
        network: transfer.pay_in.network ?? "",
        expiresAt: transfer.pay_in.expires_at ?? "",
      },
    };
  }

  const details = transfer.pay_in.recipient_details;
  return {
    depositId: deposit.id,
    bankDetails: {
      accountName: details?.account_name ?? "",
      accountNumber: details?.account_number ?? "",
      bankName: details?.bank_name ?? "",
      expiresAt: transfer.pay_in.expires_at ?? "",
    },
  };
}

export interface DepositStatusState {
  status?: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

// Lightweight poll target for the deposit instructions screen. Originally this only read our
// own `deposits.status` column, trusting the webhook (or the reconciliation cron) to have
// updated it — but neither can be relied on to actually fire (Busha's webhook has never once
// delivered to this endpoint in production, per webhook_events being empty, and the cron was
// never reachable on Vercel's Hobby plan and has no external scheduler wired up yet — see
// src/app/api/cron/reconcile-deposits). So while a Busha deposit sits pending, this now checks
// Busha's own transfer status directly on every poll and self-heals by crediting immediately if
// funds have already arrived — the user gets credited within one poll cycle even if every other
// automated path is down.
export async function checkDepositStatus(depositId: string): Promise<DepositStatusState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("deposits")
    .select("status, provider, provider_reference")
    .eq("id", depositId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Deposit not found." };

  if (data.status === "pending" && data.provider === "busha" && data.provider_reference) {
    try {
      const transfer = await busha.getTransfer(data.provider_reference);
      if (transfer.status === "funds_received") {
        const admin = createAdminClient();
        const { error: creditError } = await admin.rpc("credit_deposit", {
          p_deposit_id: depositId,
        });
        if (creditError) {
          console.error("[checkDepositStatus] credit_deposit RPC failed", {
            depositId,
            providerReference: data.provider_reference,
            error: creditError,
          });
        } else {
          return { status: "completed" };
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const admin = createAdminClient();
        const { error: failError } = await admin.rpc("fail_deposit", { p_deposit_id: depositId });
        if (failError) {
          console.error("[checkDepositStatus] fail_deposit RPC failed", {
            depositId,
            providerReference: data.provider_reference,
            error: failError,
          });
        } else {
          return { status: "failed" };
        }
      }
    } catch (err) {
      // Don't fail the poll over a transient Busha API error — just fall through and report
      // whatever our own DB currently says, and log so a persistent failure is visible.
      console.error("[checkDepositStatus] Busha reconciliation check failed", {
        depositId,
        providerReference: data.provider_reference,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return { status: data.status };
}
