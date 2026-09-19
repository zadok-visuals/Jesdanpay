"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import { applyMarkup, formatEffectiveRate } from "@/lib/busha/markup";

export interface BushaQuoteView {
  id: string;
  sourceAmount: string;
  sourceCurrency: Currency;
  targetAmount: string;
  targetCurrency: Currency;
  rateExplained: string;
  feeSummary: string;
  expiresAt: string;
}

export interface BushaActionState {
  error?: string;
  quote?: BushaQuoteView;
  transactionId?: string;
}

// Gets a real Busha swap quote, then applies the 0.5% customer-facing markup on top of it.
// Busha's own quoted amount is only ever used server-side to compute the effective figure —
// never echoed back from the client and trusted.
export async function getSwapQuote(
  _prevState: BushaActionState,
  formData: FormData,
): Promise<BushaActionState> {
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

  try {
    const raw = await busha.createQuote({
      sourceCurrency,
      targetCurrency,
      sourceAmount: amount,
    });

    const effectiveTargetAmount = applyMarkup(Number(raw.target_amount));

    return {
      quote: {
        id: raw.id,
        sourceAmount: raw.source_amount,
        sourceCurrency,
        targetAmount: effectiveTargetAmount.toFixed(2),
        targetCurrency,
        rateExplained: formatEffectiveRate(
          Number(raw.source_amount),
          effectiveTargetAmount,
          sourceCurrency,
          targetCurrency,
        ),
        feeSummary: "Included in rate (0.5%)",
        expiresAt: raw.expires_at,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get a quote right now." };
  }
}

// Executes the swap with Busha, then creates the internal transaction using Busha's own
// transfer-response amounts — never the quote amounts the client already has, since those may
// have expired or (in principle) been tampered with client-side.
export async function confirmSwap(
  _prevState: BushaActionState,
  formData: FormData,
): Promise<BushaActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return { error: "Missing quote." };

  let transfer;
  try {
    transfer = await busha.createTransfer(quoteId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not execute the swap." };
  }

  const sourceCurrency = transfer.source_currency.toUpperCase() as Currency;
  const targetCurrency = transfer.target_currency.toUpperCase() as Currency;
  const sourceAmount = Number(transfer.source_amount);
  const effectiveTargetAmount = applyMarkup(Number(transfer.target_amount));

  const { data: transactionId, error: rpcError } = await supabase.rpc("create_busha_swap_transaction", {
    p_source_currency: sourceCurrency,
    p_target_currency: targetCurrency,
    p_source_amount: sourceAmount,
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

  if (currency !== "NGN" && currency !== "GHS" && currency !== "KES" && currency !== "USDT") {
    return { error: "Deposits are only available in NGN, GHS, KES, or USDT." };
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
    return { error: err instanceof Error ? err.message : "Could not get a deposit quote right now." };
  }
}

export interface DepositActionState {
  error?: string;
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
    return { error: err instanceof Error ? err.message : "Could not start the deposit." };
  }

  const admin = createAdminClient();
  // Credit the wallet for Busha's own confirmed `target_amount` (net of their gateway fee),
  // not the gross amount the client asked to deposit — confirmed live that a ₦2,000 deposit
  // quote returns `target_amount: "1900"` after a ₦100 fee, so crediting the raw requested
  // amount would over-credit the user by the fee every time.
  const { error: insertError } = await admin.from("deposits").insert({
    user_id: user.id,
    currency,
    amount: Number(transfer.target_amount),
    provider: "busha",
    provider_reference: transfer.id,
  });
  if (insertError) return { error: insertError.message };

  if (transfer.pay_in.address) {
    return {
      cryptoAddress: {
        address: transfer.pay_in.address,
        network: transfer.pay_in.network ?? "",
        expiresAt: transfer.pay_in.expires_at ?? "",
      },
    };
  }

  const details = transfer.pay_in.recipient_details;
  return {
    bankDetails: {
      accountName: details?.account_name ?? "",
      accountNumber: details?.account_number ?? "",
      bankName: details?.bank_name ?? "",
      expiresAt: transfer.pay_in.expires_at ?? "",
    },
  };
}
