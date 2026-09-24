"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Currency, PayoutMethod, RmbRecipient } from "@/lib/types/database";
import { toCustomerError } from "@/lib/provider-error";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import { computeConversionAmounts, round2, type CnyDirection } from "@/lib/cny/tiers";

export interface PaymentsActionState {
  error?: string;
  transactionId?: string;
}

async function uploadRecipientQrCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File,
) {
  const path = `${userId}/qr-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("rmb-recipient-qr").upload(path, file);
  if (error) throw error;
  return path;
}

export async function submitRmbExchange(
  _prevState: PaymentsActionState,
  formData: FormData,
): Promise<PaymentsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const payoutMethod = String(formData.get("payoutMethod") ?? "") as PayoutMethod;
  const sourceCurrency = String(formData.get("sourceCurrency") ?? "") as Currency;
  const amount = Number(formData.get("amount"));
  const qrCodeFile = formData.get("qrCodeFile") as File | null;
  const saveRecipient = formData.get("saveRecipient") === "true";
  const saveLabel = String(formData.get("saveLabel") ?? "").trim();

  if (!["alipay", "wechat", "bank"].includes(payoutMethod)) {
    return { error: "Invalid payout method." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }
  if (saveRecipient && !saveLabel) {
    return { error: "Give this saved recipient a name." };
  }

  let qrCodeRef: string | undefined;
  if (qrCodeFile && qrCodeFile.size > 0) {
    try {
      qrCodeRef = await uploadRecipientQrCode(supabase, user.id, qrCodeFile);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not upload the QR code image." };
    }
  }

  let recipientInsert: Partial<RmbRecipient> & Pick<RmbRecipient, "user_id" | "payout_method"> = {
    user_id: user.id,
    payout_method: payoutMethod,
    qr_code_ref: qrCodeRef,
  };

  if (payoutMethod === "alipay" || payoutMethod === "wechat") {
    const firstName = String(formData.get("recipientFirstName") ?? "").trim();
    const lastName = String(formData.get("recipientLastName") ?? "").trim();
    if (!firstName || !lastName) {
      return { error: "Recipient first and last name are required." };
    }
    recipientInsert = {
      ...recipientInsert,
      recipient_first_name: firstName,
      recipient_last_name: lastName,
    };

    if (payoutMethod === "alipay") {
      const alipayId = String(formData.get("recipientAlipayId") ?? "").trim();
      if (!alipayId && !qrCodeRef) return { error: "Recipient phone number, email, or a QR code is required." };
      recipientInsert = { ...recipientInsert, recipient_alipay_id: alipayId || null };
    } else {
      const wechatId = String(formData.get("recipientWechatId") ?? "").trim();
      if (!wechatId && !qrCodeRef) return { error: "Recipient phone number, email, or a QR code is required." };
      recipientInsert = { ...recipientInsert, recipient_wechat_id: wechatId || null };
    }
  } else {
    const accountNumber = String(formData.get("recipientBankAccountNumber") ?? "").trim();
    const bankName = String(formData.get("recipientBankName") ?? "").trim();
    const accountHolder = String(formData.get("recipientAccountHolderName") ?? "").trim();
    if (!accountNumber || !bankName || !accountHolder) {
      return { error: "All three bank account fields are required." };
    }
    recipientInsert = {
      ...recipientInsert,
      recipient_bank_account_number: accountNumber,
      recipient_bank_name: bankName,
      recipient_account_holder_name: accountHolder,
    };
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("rmb_recipients")
    .insert(recipientInsert)
    .select("id")
    .single();
  if (recipientError) return { error: recipientError.message };

  const { data: transactionId, error: rpcError } = await supabase.rpc(
    "create_rmb_manual_transaction",
    { p_recipient_id: recipient.id, p_currency: sourceCurrency, p_amount: amount },
  );

  if (rpcError) {
    // Keep the recipients table clean if the transaction couldn't be created.
    await supabase.from("rmb_recipients").delete().eq("id", recipient.id);
    return { error: rpcError.message };
  }

  if (saveRecipient) {
    await supabase.from("saved_rmb_recipients").insert({
      user_id: user.id,
      label: saveLabel,
      payout_method: payoutMethod,
      recipient_alipay_id: recipientInsert.recipient_alipay_id ?? null,
      recipient_wechat_id: recipientInsert.recipient_wechat_id ?? null,
      recipient_first_name: recipientInsert.recipient_first_name ?? null,
      recipient_last_name: recipientInsert.recipient_last_name ?? null,
      recipient_bank_account_number: recipientInsert.recipient_bank_account_number ?? null,
      recipient_bank_name: recipientInsert.recipient_bank_name ?? null,
      recipient_account_holder_name: recipientInsert.recipient_account_holder_name ?? null,
      qr_code_ref: qrCodeRef ?? null,
    });
    // Best-effort — a failed save shouldn't fail the transfer that already succeeded above.
  }

  return { transactionId: transactionId ?? undefined };
}

interface CnyRatePreview {
  nonCnyCurrency: Currency;
  cnyAmount: number;
  nonCnyAmount: number;
  bushaRate: number | null;
  tierRate: number;
}

// Used internally by submitCnyConversion at lock-in — the live "preview" a user sees while
// typing is computed entirely client-side (via previewLiveBushaRate + computeConversionAmounts,
// no full-preview action needed), so lock-in never trusts a client-echoed rate —
// it recomputes this fresh from scratch every time, exactly like every other provider-backed
// action in this project (see getSwapQuote's header comment).
//
// `amount` means the fiat/USDT amount being converted when direction is "to_cny", or the CNY
// amount being spent when direction is "from_cny". Only ever touches Busha as a read-only quote
// lookup (never createTransfer) — the CNY balance stays a synthetic ledger entry with no real
// provider-side movement until the user actually spends it via the existing "Send to China" flow.
// The actual arithmetic lives in computeConversionAmounts (src/lib/cny/tiers.ts) — a pure
// function the client calls too, once it has a cached live rate, so a live "you'll receive"
// field can never drift from what this server-side path independently recomputes at commit time.
async function computeCnyRate(
  direction: CnyDirection,
  nonCnyCurrency: Currency,
  amount: number,
): Promise<{ preview: CnyRatePreview } | { error: string }> {
  const supabase = await createClient();
  const { data: tiers } = await supabase.from("cny_tier_rates").select("*");
  if (!tiers || tiers.length === 0) {
    return { error: "Conversion rates are not configured yet." };
  }

  try {
    let bushaRate: number | null = null;
    if (nonCnyCurrency !== "USDT") {
      // USDT per 1 unit of nonCnyCurrency, regardless of direction — see probeFiatToUsdtRate's
      // header comment for why it's never probed the other way.
      bushaRate = await probeFiatToUsdtRate(nonCnyCurrency);
    }

    const amounts = computeConversionAmounts(direction, amount, bushaRate, tiers);
    if (!amounts) return { error: "Conversion rates are not configured yet." };

    return {
      preview: {
        nonCnyCurrency,
        cnyAmount: amounts.cnyAmount,
        nonCnyAmount: amounts.nonCnyAmount,
        bushaRate,
        tierRate: amounts.tierRate,
      },
    };
  } catch (err) {
    return { error: toCustomerError(err, "payments.computeCnyRate") };
  }
}

// The admin-configurable markup applied on top of the live rate + tiered rate before a user ever
// sees a final number — one shared row so Convert CNY and Pay to China can't drift out of sync,
// but split by currency type (fiat vs USDT) since they're genuinely different agreed rates (2%
// fiat, 1% USDT) — collapsing them into one value was a regression from an earlier patch this
// session. Falls back to 0 (never blocks a conversion) if somehow unset.
async function getCnyMarkupRate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nonCnyCurrency: Currency,
): Promise<number> {
  const { data } = await supabase.from("cny_markup_rate").select("fiat_markup_rate, usdt_markup_rate").single();
  if (!data) return 0;
  return nonCnyCurrency === "USDT" ? data.usdt_markup_rate : data.fiat_markup_rate;
}

export interface LiveRateState {
  error?: string;
  rate?: number;
}

// Lightweight rate-only lookup — no amount, no tier math, just "USDT per 1 unit of currency"
// (or null for USDT itself, which has no fiat leg). Called once per currency/direction change
// (not per keystroke) by both Convert CNY and Convert USDT, so they cache the exact same live
// number a Server Action would otherwise recompute redundantly on every render.
export async function previewLiveBushaRate(currency: Currency): Promise<LiveRateState> {
  if (currency === "USDT") return { rate: undefined };
  try {
    const rate = await probeFiatToUsdtRate(currency);
    return { rate };
  } catch (err) {
    return { error: toCustomerError(err, "payments.previewLiveBushaRate") };
  }
}

function parseCnyFormInputs(formData: FormData) {
  return {
    direction: String(formData.get("direction") ?? "") as CnyDirection,
    nonCnyCurrency: String(formData.get("nonCnyCurrency") ?? "") as Currency,
    amount: Number(formData.get("amount")),
  };
}

export interface CnyConvertActionState {
  error?: string;
  conversionId?: string;
}

export async function submitCnyConversion(
  _prevState: CnyConvertActionState,
  formData: FormData,
): Promise<CnyConvertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { direction, nonCnyCurrency, amount } = parseCnyFormInputs(formData);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }

  // Independent reads — neither depends on the other's result — run concurrently instead of
  // adding a fully sequential round trip for no reason.
  const [result, margin] = await Promise.all([
    computeCnyRate(direction, nonCnyCurrency, amount),
    getCnyMarkupRate(supabase, nonCnyCurrency),
  ]);
  if ("error" in result) return { error: result.error };
  const { preview } = result;
  const fromCurrency: Currency = direction === "to_cny" ? nonCnyCurrency : "CNY";
  const fromAmount = direction === "to_cny" ? preview.nonCnyAmount : preview.cnyAmount;
  const toCurrency: Currency = direction === "to_cny" ? "CNY" : nonCnyCurrency;
  const rawToAmount = direction === "to_cny" ? preview.cnyAmount : preview.nonCnyAmount;
  const toAmount = round2(rawToAmount * (1 - margin));

  const { data: conversionId, error } = await supabase.rpc("record_cny_conversion", {
    p_direction: direction,
    p_from_currency: fromCurrency,
    p_from_amount: fromAmount,
    p_to_currency: toCurrency,
    p_to_amount: toAmount,
    p_busha_rate: preview.bushaRate,
    p_tier_rate: preview.tierRate,
    p_margin_rate: margin,
  });

  if (error) return { error: error.message };
  return { conversionId: conversionId ?? undefined };
}
