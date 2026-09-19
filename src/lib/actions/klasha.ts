"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as klasha from "@/lib/klasha/client";

// Klasha's payout markup is a cost-side markup (not the "reduce what the customer receives"
// shape used for swaps): the vendor must receive a fixed CNY amount, so the markup instead
// increases what the customer pays in their own currency for that same CNY amount — the gap
// between what Klasha actually charges and what we debit is the revenue.
const MARKUP_RATE = 0.005;

export interface KlashaQuoteView {
  quotationId: number;
  sourceCurrency: Currency;
  sourceAmount: string;
  destinationAmount: string;
  fxRate: number;
  expiresAt: string;
}

export interface KlashaActionState {
  error?: string;
  quote?: KlashaQuoteView;
  transactionId?: string;
}

// Only NGN/GHS are offered here — Klasha's own docs never confirm KES or USDT as inputs to
// this payout product, and the client's own instruction routes KES/USDT to manual OTC instead.
export async function getCnyPayoutQuote(
  _prevState: KlashaActionState,
  formData: FormData,
): Promise<KlashaActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sourceCurrency = String(formData.get("sourceCurrency") ?? "").toUpperCase() as Currency;
  const destinationAmount = String(formData.get("destinationAmount") ?? "");

  if (sourceCurrency !== "NGN" && sourceCurrency !== "GHS") {
    return { error: "Instant CNY settlement is only available from an NGN or GHS balance." };
  }
  if (!Number.isFinite(Number(destinationAmount)) || Number(destinationAmount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  try {
    const raw = await klasha.createCnyQuote({ sourceCurrency, destinationAmount });
    const effectiveSourceAmount = raw.sourceAmount * (1 + MARKUP_RATE);

    return {
      quote: {
        quotationId: raw.id,
        sourceCurrency,
        sourceAmount: effectiveSourceAmount.toFixed(2),
        destinationAmount: raw.destinationAmount.toFixed(2),
        fxRate: raw.fxRate,
        expiresAt: new Date(raw.expiration).toISOString(),
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get a rate right now." };
  }
}

// Debits the user's wallet for the marked-up amount already shown to them (same
// client-supplied-amount trust boundary the existing manual RMB flow already accepts, since
// there's no "fetch quote by id" endpoint to re-verify against — Klasha's own quotationId,
// not this amount, governs what actually gets delivered). Bank-transfer recipients only for
// now — Klasha's confirmed CNY payout examples only cover BANK_ACCOUNT; Alipay/WeChat wallet
// payout is listed as a serviceCode option but its request shape isn't confirmed anywhere, so
// it stays on the manual OTC path until verified.
export async function confirmCnyPayout(
  _prevState: KlashaActionState,
  formData: FormData,
): Promise<KlashaActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const quotationId = Number(formData.get("quotationId"));
  const sourceCurrency = String(formData.get("sourceCurrency") ?? "").toUpperCase() as Currency;
  const sourceAmount = Number(formData.get("sourceAmount"));
  const destinationAmount = Number(formData.get("destinationAmount"));
  const accountName = String(formData.get("accountName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const receiverFirstName = String(formData.get("receiverFirstName") ?? "").trim();
  const receiverLastName = String(formData.get("receiverLastName") ?? "").trim();
  const receiverIdNumber = String(formData.get("receiverIdNumber") ?? "").trim();
  const receiverMobileNumber = String(formData.get("receiverMobileNumber") ?? "").trim();

  if (!quotationId || !accountName || !accountNumber || !bankCode || !bankName) {
    return { error: "All bank details are required." };
  }
  if (!receiverFirstName || !receiverLastName || !receiverIdNumber || !receiverMobileNumber) {
    return { error: "Receiver name, ID number, and mobile number are required for China bank transfers." };
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("rmb_recipients")
    .insert({
      user_id: user.id,
      payout_method: "bank",
      recipient_bank_account_number: accountNumber,
      recipient_bank_name: bankName,
      recipient_account_holder_name: accountName,
      receiver_id_number: receiverIdNumber,
      receiver_id_type: "ID_CARD",
      receiver_mobile_number: receiverMobileNumber,
    })
    .select("id")
    .single();
  if (recipientError) return { error: recipientError.message };

  const requestId = randomUUID();

  const { data: transactionId, error: rpcError } = await supabase.rpc("create_klasha_rmb_transaction", {
    p_recipient_id: recipient.id,
    p_source_currency: sourceCurrency,
    p_source_amount: sourceAmount,
    p_target_amount: destinationAmount,
    p_provider_reference: requestId,
  });

  if (rpcError) {
    await supabase.from("rmb_recipients").delete().eq("id", recipient.id);
    return { error: rpcError.message };
  }

  try {
    const transfer = await klasha.initiateCnyTransfer({
      quotationId,
      requestId,
      accountName,
      accountNumber,
      bankCode,
      bankName,
      receiverFirstName,
      receiverLastName,
      receiverIdNumber,
      receiverIdType: "ID_CARD",
      receiverMobileNumber,
      purpose: "GOODS_PURCHASE",
    });

    if (transfer.payoutStatus === "SUCCESSFUL" && transactionId) {
      const admin = createAdminClient();
      await admin.rpc("complete_klasha_rmb_transaction", {
        p_transaction_id: transactionId,
        p_actual_target_amount: transfer.amount,
      });
    }
    // PENDING is left for the webhook to resolve; the transaction and debit already stand.
  } catch (err) {
    // The debit and pending transaction stand either way — visible in the admin Klasha queue
    // for manual follow-up, same conservative handling as the Busha/swap confirm actions.
    return { error: err instanceof Error ? err.message : "Payout could not be started — visible in admin for follow-up." };
  }

  return { transactionId: transactionId ?? undefined };
}

export interface KlashaDepositState {
  error?: string;
  bankDetails?: { accountNumber: string; bankName: string; expiresAt: string };
  redirectUrl?: string;
}

// Deposit collection for NGN and GHS only — confirmed absence, not unconfirmed: Klasha's
// Payments API documents `currency: NGN|ZAR|GHS` with no KES and no crypto anywhere, so KES
// and USDT stay on Busha (which already works for both). NGN returns bank account details
// directly; GHS returns a redirect URL to Klasha's hosted payment page instead (same as ZAR)
// — the two need different UI treatment, handled by returning one or the other here.
export async function initiateKlashaDeposit(
  _prevState: KlashaDepositState,
  formData: FormData,
): Promise<KlashaDepositState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency = String(formData.get("currency") ?? "").toUpperCase();
  const amount = String(formData.get("amount") ?? "");

  if (currency !== "NGN" && currency !== "GHS") {
    return { error: "Klasha deposits are only available in NGN or GHS." };
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, email")
    .eq("id", user.id)
    .single();
  if (!profile?.phone) {
    return { error: "Add a phone number to your profile (complete KYC) before depositing via Klasha." };
  }

  const txRef = randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let result;
  try {
    result = await klasha.createCollection({
      txRef,
      currency,
      amount,
      email: profile.email,
      phoneNumber: profile.phone,
      fullName: profile.full_name ?? profile.email,
      redirectUrl: `${appUrl}/accounts`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the deposit." };
  }

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("deposits").insert({
    user_id: user.id,
    currency,
    amount: Number(amount),
    provider: "klasha",
    provider_reference: result.tx_ref,
  });
  if (insertError) return { error: insertError.message };

  const auth = result.meta.authorization;
  if (auth.mode === "redirect" && auth.redirect) {
    return { redirectUrl: auth.redirect };
  }
  return {
    bankDetails: {
      accountNumber: auth.transfer_account ?? "",
      bankName: auth.transfer_bank ?? "",
      expiresAt: auth.account_expiration ?? "",
    },
  };
}
