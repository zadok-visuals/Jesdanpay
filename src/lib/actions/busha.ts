"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import { getUsdtPairRates } from "@/lib/busha/rate";
import { applyMarkup } from "@/lib/busha/markup";
import { MINIMUM_USDT_EQUIVALENT, FIAT_MINIMUM_DEPOSIT } from "@/lib/busha/limits";

// FIAT_MINIMUM_DEPOSIT is only keyed by the fiat currencies that have a confirmed minimum — looks
// up by exact currency match rather than a cast, so an unconfigured currency (USDT, or a fiat one
// with no confirmed minimum yet) always resolves to undefined and simply isn't enforced.
function fiatMinimumFor(currency: Currency): number | undefined {
  return currency === "NGN" || currency === "GHS" || currency === "KES" ? FIAT_MINIMUM_DEPOSIT[currency] : undefined;
}
import { toCustomerError } from "@/lib/provider-error";

export interface SwapRateState {
  buyRate?: number;
  sellRate?: number;
  error?: string;
}

// Live buy AND sell rates for a USDT/<fiat> pair, via Busha's balance-independent /v1/pairs
// lookup (see getUsdtPairRates's header comment) — genuinely different numbers, not one rate
// inverted for display. Fetched once per fiat-currency change; UsdtExchangeForm picks whichever
// side applies to the direction currently selected.
export async function previewSwapRate(fiatCurrency: Currency): Promise<SwapRateState> {
  try {
    const rates = await getUsdtPairRates(fiatCurrency);
    if (!rates) return { error: `Conversions from ${fiatCurrency} aren't available right now. Please try again later.` };
    return { buyRate: rates.buyRate, sellRate: rates.sellRate };
  } catch (err) {
    return { error: toCustomerError(err, "busha.previewSwapRate") };
  }
}

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

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return { error: "Enter a valid amount." };
  }

  // Must run BEFORE calling Busha, not after: by the time a quote/transfer response exists, the
  // real transfer has already executed at the provider — rejecting post-hoc using its response
  // amounts (e.g. rawTargetAmount) would be too late to actually stop a sub-minimum swap.
  try {
    const usdtEquivalent =
      sourceCurrency === "USDT"
        ? amountNum
        : await (async () => {
            const rates = await getUsdtPairRates(sourceCurrency);
            if (!rates) throw new Error(`Conversions from ${sourceCurrency} aren't available right now. Please try again later.`);
            return amountNum / rates.buyRate;
          })();
    if (usdtEquivalent < MINIMUM_USDT_EQUIVALENT) {
      return { error: "Minimum amount must be equivalent to 10 USDT" };
    }
  } catch (err) {
    return { error: toCustomerError(err, "busha.executeSwap") };
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
  const rawTargetAmount = Number(transfer.target_amount);
  const effectiveTargetAmount = applyMarkup(rawTargetAmount);

  const { data: transactionId, error: rpcError } = await supabase.rpc("create_busha_swap_transaction", {
    p_source_currency: txSourceCurrency,
    p_target_currency: txTargetCurrency,
    p_source_amount: txSourceAmount,
    p_target_amount: Number(effectiveTargetAmount.toFixed(2)),
    p_provider_reference: transfer.id,
    // Busha's real, pre-markup amount — kept for the admin markup-collected audit trail (see
    // migration 0025) even though the customer is only ever shown/credited the marked-up figure.
    p_raw_target_amount: Number(rawTargetAmount.toFixed(2)),
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

  revalidatePath("/home");
  revalidatePath("/accounts");
  return { transactionId: transactionId ?? undefined };
}

export interface DepositQuoteState {
  error?: string;
  quoteId?: string;
  fee?: string;
  // Busha's own quoted target_amount — the exact net figure the deposit will credit once
  // executed (what initiateDeposit later reads off the resulting transfer), not amount - fee
  // recomputed client-side, so the payment-instructions screen can never show a net figure that
  // drifts from what actually gets credited.
  netAmount?: string;
  // Busha's own quoted source_amount — the real, possibly grossed-up figure to show as
  // "Transfer exactly"/"Send exactly". See quoteForDesiredNetDeposit's header comment for why
  // this can legitimately differ from `amount` below.
  grossAmount?: string;
  // The user's originally typed amount — kept separate from grossAmount/netAmount so
  // initiateDeposit's minimum-deposit re-check keeps applying to what the user actually asked to
  // have credited, not the grossed-up transfer figure.
  amount?: string;
  currency?: Currency;
}

// Confirmed live (not assumed) against the real Busha account: requesting a same-currency deposit
// quote via plain `source_amount` behaves DIFFERENTLY depending on the currency's fee type.
//   - KES (a PERCENTAGE fee): source_amount is treated as the desired NET — the response's own
//     source_amount already comes back grossed up to cover the fee, and target_amount exactly
//     equals what was requested. No second quote needed.
//   - NGN (a FIXED fee): source_amount is echoed back unchanged (a true forward quote) and
//     target_amount = source_amount - fee, i.e. LESS than what was requested.
//   - USDT: no fee at all currently: source_amount == target_amount either way.
// Rather than hardcode which currency behaves which way (that's exactly the kind of assumption
// this task asked not to make, and it'd silently go stale if Busha's fee model for any of these
// ever changes), this only re-quotes with (desiredNet + fee) as source_amount when the FIRST
// quote's target_amount doesn't already match the desired net — correct and minimal for both
// behaviors observed live, and self-correcting either way.
async function quoteForDesiredNetDeposit(currency: Currency, desiredNet: number): Promise<busha.BushaQuote> {
  const quote1 = await busha.createQuote({
    sourceCurrency: currency,
    targetCurrency: currency,
    sourceAmount: desiredNet.toString(),
    isDeposit: true,
  });
  if (Math.abs(Number(quote1.target_amount) - desiredNet) < 0.01) {
    return quote1;
  }
  const fee = quote1.fees.reduce((sum, f) => sum + Number(f.amount.amount), 0);
  return busha.createQuote({
    sourceCurrency: currency,
    targetCurrency: currency,
    sourceAmount: (desiredNet + fee).toString(),
    isDeposit: true,
  });
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

  const minimum = fiatMinimumFor(currency);
  if (minimum != null && Number(amount) < minimum) {
    return { error: `Minimum ${currency} deposit is ${minimum}.` };
  }

  try {
    const quote = await quoteForDesiredNetDeposit(currency, Number(amount));
    const fee = quote.fees.reduce((sum, f) => sum + Number(f.amount.amount), 0);
    return {
      quoteId: quote.id,
      fee: fee.toFixed(2),
      netAmount: quote.target_amount,
      grossAmount: quote.source_amount,
      amount,
      currency,
    };
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
  const amount = String(formData.get("amount") ?? "");
  if (!quoteId) return { error: "Missing quote." };

  // Re-checked here too, not just in getDepositQuote — this is the actual point of no return
  // (money moves once createTransfer below succeeds), so it shouldn't rely solely on trusting
  // that whatever called this with a quoteId already enforced the minimum upstream.
  const minimum = fiatMinimumFor(currency);
  if (minimum != null && Number(amount) < minimum) {
    return { error: `Minimum ${currency} deposit is ${minimum}.` };
  }

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
        // Busha's transfer amount self-corrects to whatever was actually confirmed on-chain —
        // never assume it matches what was originally requested (confirmed live: a user can
        // request 10 USDT and send 12, and Busha reports source_amount/target_amount as 12 once
        // received). Credit the real amount, not the stale deposits.amount recorded at request
        // time.
        const { error: creditError } = await admin.rpc("credit_deposit", {
          p_deposit_id: depositId,
          p_actual_amount: Number(transfer.target_amount),
        });
        if (creditError) {
          console.error("[checkDepositStatus] credit_deposit RPC failed", {
            depositId,
            providerReference: data.provider_reference,
            error: creditError,
          });
        } else {
          revalidatePath("/home");
          revalidatePath("/accounts");
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

export interface SwapStatusState {
  status?: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

// Live poll target for the swap confirmation screen — same rationale as checkDepositStatus.
// executeSwap only completes synchronously on an unambiguous funds_converted/funds_delivered
// response; anything else was left pending for a webhook that, like the deposit one, can't be
// relied on to ever arrive. This checks Busha's own transfer status directly on every poll and
// self-heals within one poll cycle, independent of both the webhook and the reconciliation cron.
export async function checkSwapStatus(transactionId: string): Promise<SwapStatusState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("transactions")
    .select("status, provider, provider_reference")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Transaction not found." };

  if (
    (data.status === "pending" || data.status === "processing") &&
    data.provider === "busha" &&
    data.provider_reference
  ) {
    try {
      const transfer = await busha.getTransfer(data.provider_reference);
      if (transfer.status === "funds_converted" || transfer.status === "funds_delivered") {
        const admin = createAdminClient();
        const { error: completeError } = await admin.rpc("complete_busha_swap_transaction", {
          p_transaction_id: transactionId,
        });
        if (completeError) {
          console.error("[checkSwapStatus] complete_busha_swap_transaction RPC failed", {
            transactionId,
            providerReference: data.provider_reference,
            error: completeError,
          });
        } else {
          revalidatePath("/home");
          revalidatePath("/accounts");
          return { status: "completed" };
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const admin = createAdminClient();
        const { error: failError } = await admin.rpc("fail_busha_swap_transaction", {
          p_transaction_id: transactionId,
        });
        if (failError) {
          console.error("[checkSwapStatus] fail_busha_swap_transaction RPC failed", {
            transactionId,
            providerReference: data.provider_reference,
            error: failError,
          });
        } else {
          revalidatePath("/home");
          revalidatePath("/accounts");
          return { status: "failed" };
        }
      }
    } catch (err) {
      console.error("[checkSwapStatus] Busha reconciliation check failed", {
        transactionId,
        providerReference: data.provider_reference,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return { status: data.status };
}
