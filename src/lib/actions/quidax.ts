"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as quidax from "@/lib/quidax/client";
import { applyMarkup, formatEffectiveRate } from "@/lib/quidax/markup";

export interface QuidaxQuote {
  id: string;
  sourceAmount: string;
  sourceCurrency: Currency;
  targetAmount: string;
  targetCurrency: Currency;
  rateExplained: string;
  feeSummary: string;
  expiresAt: string;
}

export interface QuidaxActionState {
  error?: string;
  quote?: QuidaxQuote;
  transactionId?: string;
}

// Gets a real Quidax swap quote, then applies the 0.5% customer-facing markup on top of it.
// Quidax's own quoted amount is only ever used server-side to compute the effective figure —
// never echoed back from the client and trusted.
export async function getSwapQuote(
  _prevState: QuidaxActionState,
  formData: FormData,
): Promise<QuidaxActionState> {
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
    const raw = await quidax.createSwapQuote({
      fromCurrency: sourceCurrency,
      toCurrency: targetCurrency,
      fromAmount: amount,
    });

    const effectiveTargetAmount = applyMarkup(Number(raw.to_amount));

    return {
      quote: {
        id: raw.id,
        sourceAmount: raw.from_amount,
        sourceCurrency,
        targetAmount: effectiveTargetAmount.toFixed(2),
        targetCurrency,
        rateExplained: formatEffectiveRate(
          Number(raw.from_amount),
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

// Confirms the swap with Quidax, then creates the internal transaction using Quidax's own
// confirm-response amounts — never the quote amounts the client already has, since those may
// have expired or (in principle) been tampered with client-side.
export async function confirmSwap(
  _prevState: QuidaxActionState,
  formData: FormData,
): Promise<QuidaxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return { error: "Missing quote." };

  let confirmed;
  try {
    confirmed = await quidax.confirmSwap(quoteId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not confirm the swap." };
  }

  const sourceCurrency = confirmed.from_currency.toUpperCase() as Currency;
  const targetCurrency = confirmed.to_currency.toUpperCase() as Currency;
  const sourceAmount = Number(confirmed.from_amount);
  const effectiveTargetAmount = applyMarkup(Number(confirmed.received_amount));

  const { data: transactionId, error: rpcError } = await supabase.rpc("create_quidax_swap_transaction", {
    p_source_currency: sourceCurrency,
    p_target_currency: targetCurrency,
    p_source_amount: sourceAmount,
    p_target_amount: Number(effectiveTargetAmount.toFixed(2)),
    p_provider_reference: confirmed.id,
  });

  if (rpcError) return { error: rpcError.message };

  // Quidax swaps confirm synchronously in most cases; complete immediately when it already has,
  // and let the webhook complete it otherwise. complete_quidax_swap_transaction is idempotent
  // (no-ops unless still pending/processing), so calling it again from the webhook later is safe.
  if (confirmed.status === "completed" && transactionId) {
    const admin = createAdminClient();
    await admin.rpc("complete_quidax_swap_transaction", { p_transaction_id: transactionId });
  }

  return { transactionId: transactionId ?? undefined };
}

export interface DepositQuoteState {
  error?: string;
  fee?: string;
  toAmount?: string;
  fiatAmount?: string;
  currency?: Currency;
}

// Pricing preview only — confirmed and working against Quidax's purchase_quotes/buy endpoint.
export async function getDepositQuote(
  _prevState: DepositQuoteState,
  formData: FormData,
): Promise<DepositQuoteState> {
  const currency = String(formData.get("currency") ?? "").toUpperCase() as Currency;
  const amount = String(formData.get("amount") ?? "");

  if (currency !== "NGN" && currency !== "GHS") {
    return { error: "Deposits are only available in NGN or GHS." };
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  try {
    const quote = await quidax.getPurchaseQuote({
      currency: currency.toLowerCase() as "ngn" | "ghs",
      token: "usdt",
      fiatAmount: amount,
      tokenNetwork: "trc20",
    });
    return { fee: quote.fee, toAmount: quote.to_amount, fiatAmount: amount, currency };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get a deposit quote right now." };
  }
}

export interface DepositActionState {
  error?: string;
}

// Deliberately not implemented yet — Quidax's actual deposit-collection endpoint (how a
// customer's bank transfer/mobile money payment gets matched and the wallet credited) isn't
// confirmed against real docs or a sandbox account. See src/lib/quidax/client.ts's
// createDeposit() stub and the plan's "open/unconfirmed" section — don't guess this.
export async function initiateDeposit(
  _prevState: DepositActionState,
  _formData: FormData,
): Promise<DepositActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return {
    error:
      "Deposits are launching soon — we're finishing verification with Quidax's payment-collection API.",
  };
}
