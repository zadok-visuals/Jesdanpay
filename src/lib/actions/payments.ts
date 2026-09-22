"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Currency, PayoutMethod, RmbRecipient } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import { BushaError } from "@/lib/busha/client";
import { toCustomerError } from "@/lib/provider-error";
import { marginFor, resolveForwardTier, resolveReverseTier, round2 } from "@/lib/cny/tiers";

// Busha's swap quotes validate against this account's *real* balance and a per-pair minimum
// (confirmed live: a 50,000 NGN probe failed "insufficient balance" against an account holding
// only ~1,800 NGN; a 100 NGN probe failed "The minimum sale amount is 262.05 NGN"). So the
// user's actual amount can never be sent to Busha directly for a rate lookup — it could easily
// exceed either ceiling. Instead, probe with a tiny amount and fall back to whatever minimum
// Busha itself reports, then derive the rate as a plain ratio of the quote's own
// target_amount/source_amount (not by parsing rate.rate's string, whose orientation isn't
// guaranteed) — same defensive pattern as formatEffectiveRate in busha/markup.ts.
//
// Also confirmed live: this account holds real NGN but zero USDT, so a USDT-sourced probe
// fails "insufficient balance" at ANY amount, including the minimum — there's no probe amount
// that would ever work in that direction. So every rate lookup here always probes
// fiat -> USDT (never the reverse) and inverts the ratio when USDT -> fiat is what's actually
// needed — sidesteps depending on the account ever holding real USDT balance at all.
async function probeFiatToUsdtRate(fiatCurrency: string): Promise<number> {
  async function quoteAt(amount: string) {
    const quote = await busha.createQuote({
      sourceCurrency: fiatCurrency,
      targetCurrency: "USDT",
      sourceAmount: amount,
    });
    return Number(quote.target_amount) / Number(quote.source_amount);
  }

  try {
    return await quoteAt("1");
  } catch (err) {
    if (err instanceof BushaError) {
      // Busha's wording varies ("minimum sale amount", "Minimum trade amount") depending on
      // the pair — confirmed live for both — so match loosely on "minimum ... amount is X".
      const match = err.message.match(/minimum .*?amount is ([\d.]+)/i);
      if (match) return await quoteAt(match[1]);
    }
    throw err;
  }
}

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

  if (payoutMethod === "alipay") {
    const alipayId = String(formData.get("recipientAlipayId") ?? "").trim();
    if (!alipayId && !qrCodeRef) return { error: "Recipient Alipay ID or a QR code is required." };
    recipientInsert = { ...recipientInsert, recipient_alipay_id: alipayId || null };
  } else if (payoutMethod === "wechat") {
    const wechatId = String(formData.get("recipientWechatId") ?? "").trim();
    if (!wechatId && !qrCodeRef) return { error: "Recipient WeChat Pay ID or a QR code is required." };
    recipientInsert = { ...recipientInsert, recipient_wechat_id: wechatId || null };
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
      recipient_bank_account_number: recipientInsert.recipient_bank_account_number ?? null,
      recipient_bank_name: recipientInsert.recipient_bank_name ?? null,
      recipient_account_holder_name: recipientInsert.recipient_account_holder_name ?? null,
      qr_code_ref: qrCodeRef ?? null,
    });
    // Best-effort — a failed save shouldn't fail the transfer that already succeeded above.
  }

  return { transactionId: transactionId ?? undefined };
}

export type CnyDirection = "to_cny" | "from_cny";

export interface CnyRatePreview {
  nonCnyCurrency: Currency;
  cnyAmount: number;
  nonCnyAmount: number;
  bushaRate: number | null;
  tierRate: number;
}

export interface CnyRateState {
  error?: string;
  preview?: CnyRatePreview;
}

// Shared by both the preview and lock-in actions so lock-in never trusts a client-echoed rate —
// it recomputes this fresh from scratch every time, exactly like every other provider-backed
// action in this project (see getSwapQuote's header comment).
//
// `amount` means the fiat/USDT amount being converted when direction is "to_cny", or the CNY
// amount being spent when direction is "from_cny". Only ever touches Busha as a read-only quote
// lookup (never createTransfer) — the CNY balance stays a synthetic ledger entry with no real
// provider-side movement until the user actually spends it via the existing "Send to China" flow.
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
    if (direction === "to_cny") {
      let usdtEquivalent = amount;
      let bushaRate: number | null = null;
      if (nonCnyCurrency !== "USDT") {
        // USDT per 1 unit of nonCnyCurrency.
        bushaRate = await probeFiatToUsdtRate(nonCnyCurrency);
        usdtEquivalent = amount * bushaRate;
      }
      const tier = resolveForwardTier(usdtEquivalent, tiers);
      if (!tier) return { error: "Conversion rates are not configured yet." };
      return {
        preview: {
          nonCnyCurrency,
          cnyAmount: round2(usdtEquivalent * tier.usdt_to_cny_rate),
          nonCnyAmount: amount,
          bushaRate,
          tierRate: tier.usdt_to_cny_rate,
        },
      };
    } else {
      const tier = resolveReverseTier(amount, tiers);
      if (!tier) return { error: "Conversion rates are not configured yet." };
      const usdtEquivalent = amount / tier.usdt_to_cny_rate;
      let nonCnyAmount = usdtEquivalent;
      let bushaRate: number | null = null;
      if (nonCnyCurrency !== "USDT") {
        // Always probe fiat -> USDT (this account never holds real USDT balance to probe the
        // other way), then invert: USDT per 1 fiat -> fiat per 1 USDT.
        bushaRate = await probeFiatToUsdtRate(nonCnyCurrency);
        nonCnyAmount = usdtEquivalent / bushaRate;
      }
      return {
        preview: {
          nonCnyCurrency,
          cnyAmount: amount,
          nonCnyAmount: round2(nonCnyAmount),
          bushaRate,
          tierRate: tier.usdt_to_cny_rate,
        },
      };
    }
  } catch (err) {
    return { error: toCustomerError(err, "payments.computeCnyRate") };
  }
}

function parseCnyFormInputs(formData: FormData) {
  return {
    direction: String(formData.get("direction") ?? "") as CnyDirection,
    nonCnyCurrency: String(formData.get("nonCnyCurrency") ?? "") as Currency,
    amount: Number(formData.get("amount")),
  };
}

// Safe to call repeatedly as the user types/changes currency — mutates nothing.
export async function previewCnyRate(
  _prevState: CnyRateState,
  formData: FormData,
): Promise<CnyRateState> {
  const { direction, nonCnyCurrency, amount } = parseCnyFormInputs(formData);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }
  const result = await computeCnyRate(direction, nonCnyCurrency, amount);
  return "error" in result ? { error: result.error } : { preview: result.preview };
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

  const result = await computeCnyRate(direction, nonCnyCurrency, amount);
  if ("error" in result) return { error: result.error };
  const { preview } = result;

  const margin = marginFor(nonCnyCurrency);
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
